import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getBindableUrls, startServer, stopServer } from "./server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.join(PROJECT_ROOT, ".runtime");
const DEFAULT_PID_FILE = path.join(RUNTIME_DIR, "server.pid");
const DEFAULT_LOG_FILE = path.join(RUNTIME_DIR, "server.log");

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const [key, explicitValue] = withoutPrefix.split("=", 2);
    if (explicitValue !== undefined) {
      parsed[key] = explicitValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i += 1;
      continue;
    }

    parsed[key] = "true";
  }

  return parsed;
}

function toBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function resolveOptions(parsed) {
  return {
    host: String(parsed.host ?? process.env.BIND ?? "0.0.0.0"),
    port: Number(parsed.port ?? process.env.PORT ?? 8000),
    rootDir: path.resolve(parsed["root-dir"] ?? PROJECT_ROOT),
    downloadsDir: path.resolve(parsed["downloads-dir"] ?? path.join(PROJECT_ROOT, "downloads")),
    pidFile: path.resolve(parsed["pid-file"] ?? DEFAULT_PID_FILE),
    logFile: path.resolve(parsed["log-file"] ?? DEFAULT_LOG_FILE),
    quiet: toBoolean(parsed.quiet, false)
  };
}

async function ensureRuntimeDir(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(pidFile) {
  try {
    const raw = await fsp.readFile(pidFile, "utf8");
    const pid = Number(raw.trim());
    if (!Number.isInteger(pid)) {
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

async function writePid(pidFile, pid) {
  await ensureRuntimeDir(pidFile);
  await fsp.writeFile(pidFile, `${pid}\n`, "utf8");
}

async function removeFileSafe(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch {
    // No-op.
  }
}

async function waitForExit(pid, timeoutMs = 6_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return !isProcessRunning(pid);
}

async function waitForHealth(port, timeoutMs = 8_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function showStatus(options) {
  const pid = await readPid(options.pidFile);
  if (!pid || !isProcessRunning(pid)) {
    await removeFileSafe(options.pidFile);
    console.log("Status: stopped");
    console.log(`Log file: ${options.logFile}`);
    return false;
  }

  const healthy = await waitForHealth(options.port, 700);
  console.log(`Status: running (PID ${pid})`);
  console.log(`Health: ${healthy ? "ok" : "degraded"}`);
  console.log(`Log file: ${options.logFile}`);
  const urls = [`http://127.0.0.1:${options.port}/`];
  for (const url of urls) {
    console.log(`URL: ${url}`);
  }
  return true;
}

function printListeningUrls(server) {
  const urls = getBindableUrls(server, "127.0.0.1");
  for (const url of urls) {
    console.log(`URL: ${url}`);
  }
}

async function serveCommand(options) {
  const { server } = await startServer(options);
  const address = server.address();
  if (!options.quiet) {
    console.log(`Server listening on ${options.host}:${typeof address === "string" ? "?" : address.port}`);
    printListeningUrls(server);
  }

  const shutdown = async () => {
    await stopServer(server);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startCommand(options) {
  const currentPid = await readPid(options.pidFile);
  if (currentPid && isProcessRunning(currentPid)) {
    console.log(`Already running (PID ${currentPid})`);
    await showStatus(options);
    return;
  }

  await ensureRuntimeDir(options.logFile);

  const outFd = fs.openSync(options.logFile, "a");
  const args = [
    path.join(PROJECT_ROOT, "scripts", "codex-web.mjs"),
    "serve",
    "--host",
    options.host,
    "--port",
    String(options.port),
    "--root-dir",
    options.rootDir,
    "--downloads-dir",
    options.downloadsDir,
    "--quiet",
    "true"
  ];

  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ["ignore", outFd, outFd],
    windowsHide: true,
    env: process.env
  });

  child.unref();
  fs.closeSync(outFd);

  await writePid(options.pidFile, child.pid);

  const healthy = await waitForHealth(options.port, 8_000);
  if (!healthy) {
    await removeFileSafe(options.pidFile);
    throw new Error(`Server failed to become healthy on port ${options.port}. Check ${options.logFile}`);
  }

  console.log(`Started (PID ${child.pid})`);
  console.log(`Log file: ${options.logFile}`);
  console.log(`Local URL: http://127.0.0.1:${options.port}/`);
}

async function stopCommand(options) {
  const pid = await readPid(options.pidFile);
  if (!pid || !isProcessRunning(pid)) {
    await removeFileSafe(options.pidFile);
    console.log("Not running.");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Ignore and continue.
  }

  const exitedGracefully = await waitForExit(pid, 5_000);
  if (!exitedGracefully) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore.
    }
    await waitForExit(pid, 1_500);
  }

  await removeFileSafe(options.pidFile);
  console.log("Stopped.");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function ensureOk(response, stepName) {
  if (!response.ok) {
    throw new Error(`${stepName} failed with ${response.status}`);
  }
}

async function selftestCommand(options) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "codex-literal-selftest-"));
  const fixtureName = "fixture.bin";
  const fixturePath = path.join(tempDir, fixtureName);
  const fixture = crypto.randomBytes(64 * 1024);
  await fsp.writeFile(fixturePath, fixture);

  const expectedHash = sha256(fixture);
  const { server } = await startServer({
    host: "127.0.0.1",
    port: 0,
    rootDir: options.rootDir,
    downloadsDir: tempDir,
    quiet: true
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve test server port");
    }

    const base = `http://127.0.0.1:${address.port}`;

    console.log("[1/6] GET /");
    const rootResponse = await fetch(`${base}/`);
    ensureOk(rootResponse, "GET /");

    console.log("[2/6] GET /healthz");
    const health = await fetch(`${base}/healthz`, { headers: { accept: "application/json" } });
    ensureOk(health, "GET /healthz");
    const healthJson = await health.json();
    if (!healthJson.ok) {
      throw new Error("Health endpoint returned unexpected payload");
    }

    console.log("[3/6] GET /api/files");
    const filesResponse = await fetch(`${base}/api/files`, { headers: { accept: "application/json" } });
    ensureOk(filesResponse, "GET /api/files");
    const filesPayload = await filesResponse.json();
    const fileEntry = (filesPayload.files ?? []).find((file) => file.name === fixtureName);
    if (!fileEntry) {
      throw new Error("Fixture file missing from manifest");
    }

    console.log("[4/6] HEAD /downloads/fixture.bin");
    const head = await fetch(`${base}/downloads/${fixtureName}`, { method: "HEAD" });
    ensureOk(head, "HEAD /downloads/fixture.bin");
    const contentLength = Number(head.headers.get("content-length"));
    if (contentLength !== fixture.length) {
      throw new Error(`Content-Length mismatch. expected=${fixture.length} actual=${contentLength}`);
    }

    console.log("[5/6] Range request");
    const range = await fetch(`${base}/downloads/${fixtureName}`, {
      headers: { range: "bytes=0-1023" }
    });
    if (range.status !== 206) {
      throw new Error(`Expected 206 range response, got ${range.status}`);
    }
    const rangeBuffer = Buffer.from(await range.arrayBuffer());
    if (rangeBuffer.length !== 1024) {
      throw new Error(`Range length mismatch. expected=1024 actual=${rangeBuffer.length}`);
    }

    console.log("[6/6] SHA256 integrity");
    const full = await fetch(`${base}/downloads/${fixtureName}`);
    ensureOk(full, "GET /downloads/fixture.bin");
    const fullBuffer = Buffer.from(await full.arrayBuffer());
    const fullHash = sha256(fullBuffer);
    if (fullHash !== expectedHash) {
      throw new Error(`SHA256 mismatch. expected=${expectedHash} actual=${fullHash}`);
    }

    console.log("Self-test passed.");
  } finally {
    await stopServer(server);
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

function help() {
  console.log(`Usage: node scripts/codex-web.mjs <command> [options]

Commands:
  serve     Run in foreground
  start     Run in background and write PID/log
  stop      Stop background process
  status    Show process status
  selftest  Run end-to-end validation

Options:
  --host <host>              Bind host (default: 0.0.0.0)
  --port <port>              Bind port (default: 8000)
  --downloads-dir <path>     Directory containing downloadable files
  --root-dir <path>          Project root containing index.html and assets/
  --pid-file <path>          PID file for start/stop/status
  --log-file <path>          Log file for start
  --quiet <true|false>       Reduce serve logs
`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed._[0] ?? "status";
  const options = resolveOptions(parsed);

  switch (command) {
    case "serve":
      await serveCommand(options);
      return;
    case "start":
      await startCommand(options);
      return;
    case "stop":
      await stopCommand(options);
      return;
    case "status":
      await showStatus(options);
      return;
    case "selftest":
      await selftestCommand(options);
      return;
    case "help":
    case "--help":
    case "-h":
      help();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
