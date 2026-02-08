import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".dmg": "application/octet-stream",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const checksumCache = new Map();

export function resolveConfig(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? PROJECT_ROOT);
  const downloadsDir = path.resolve(options.downloadsDir ?? path.join(rootDir, "downloads"));
  const host = String(options.host ?? process.env.BIND ?? "0.0.0.0");
  const port = Number(options.port ?? process.env.PORT ?? 8000);
  const quiet = Boolean(options.quiet ?? false);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }

  return {
    rootDir,
    downloadsDir,
    host,
    port,
    quiet,
    assetsDir: path.join(rootDir, "assets"),
    indexFile: path.join(rootDir, "index.html")
  };
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isWithin(baseDir, targetPath) {
  const rel = path.relative(baseDir, targetPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function safeJoin(baseDir, rawPath) {
  const decoded = safeDecode(rawPath);
  const withoutLeadingSlash = decoded.replace(/^[/\\]+/, "");
  const normalized = path.normalize(withoutLeadingSlash);
  const candidate = path.join(baseDir, normalized);
  if (!isWithin(baseDir, candidate)) {
    return null;
  }
  return candidate;
}

function fileEtag(stat) {
  return `W/\"${stat.size}-${Math.trunc(stat.mtimeMs)}\"`;
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) {
    return null;
  }

  const spec = rangeHeader.slice("bytes=".length).trim();
  if (spec.includes(",")) {
    return { unsatisfiable: true };
  }

  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match) {
    return { unsatisfiable: true };
  }

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) {
    return { unsatisfiable: true };
  }

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return { unsatisfiable: true };
    }
    if (suffixLength >= fileSize) {
      return { start: 0, end: fileSize - 1 };
    }
    return { start: fileSize - suffixLength, end: fileSize - 1 };
  }

  let start = Number(startRaw);
  let end = endRaw ? Number(endRaw) : fileSize - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0) {
    return { unsatisfiable: true };
  }

  if (start >= fileSize) {
    return { unsatisfiable: true };
  }

  end = Math.min(end, fileSize - 1);
  if (end < start) {
    return { unsatisfiable: true };
  }

  return { start, end };
}

async function hashFile(filePath, stat) {
  const cacheKey = filePath;
  const cacheTag = `${stat.size}:${Math.trunc(stat.mtimeMs)}`;
  const existing = checksumCache.get(cacheKey);
  if (existing && existing.tag === cacheTag) {
    return existing.sha256;
  }

  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
  });

  const sha256 = hash.digest("hex");
  checksumCache.set(cacheKey, { tag: cacheTag, sha256 });
  return sha256;
}

async function asFileStat(filePath) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) {
    return null;
  }
  return stat;
}

async function listDownloadEntries(config) {
  const items = [];

  await fsp.mkdir(config.downloadsDir, { recursive: true });

  let dirEntries = [];
  try {
    dirEntries = await fsp.readdir(config.downloadsDir, { withFileTypes: true });
  } catch {
    dirEntries = [];
  }

  for (const entry of dirEntries) {
    if (!(entry.isFile() || entry.isSymbolicLink())) {
      continue;
    }
    const filePath = path.join(config.downloadsDir, entry.name);
    let stat;
    try {
      stat = await asFileStat(filePath);
    } catch {
      stat = null;
    }
    if (!stat) {
      continue;
    }
    items.push({
      name: entry.name,
      absolutePath: filePath,
      url: `/downloads/${encodeURIComponent(entry.name)}`,
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
      stat
    });
  }

  const legacyDmgPath = path.join(config.rootDir, "Codex.dmg");
  try {
    const legacyStat = await asFileStat(legacyDmgPath);
    const alreadyExists = items.some((item) => item.name === "Codex.dmg");
    if (legacyStat && !alreadyExists) {
      items.push({
        name: "Codex.dmg",
        absolutePath: legacyDmgPath,
        url: "/Codex.dmg",
        size: legacyStat.size,
        lastModified: legacyStat.mtime.toISOString(),
        stat: legacyStat
      });
    }
  } catch {
    // Ignore missing legacy file.
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  const manifest = [];
  for (const item of items) {
    const sha256 = await hashFile(item.absolutePath, item.stat);
    manifest.push({
      name: item.name,
      size: item.size,
      lastModified: item.lastModified,
      sha256,
      url: item.url
    });
  }

  return manifest;
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(message),
    "cache-control": "no-store"
  });
  response.end(message);
}

function canReadBody(method) {
  return method === "GET" || method === "HEAD";
}

async function streamFile(request, response, filePath, options = {}) {
  if (!canReadBody(request.method)) {
    response.writeHead(405, {
      allow: "GET, HEAD",
      "content-type": "text/plain; charset=utf-8"
    });
    response.end("Method not allowed");
    return;
  }

  let stat;
  try {
    stat = await asFileStat(filePath);
  } catch {
    stat = null;
  }

  if (!stat) {
    sendText(response, 404, "Not found");
    return;
  }

  const headers = {
    "content-type": mimeTypeFor(filePath),
    "last-modified": stat.mtime.toUTCString(),
    etag: fileEtag(stat),
    "accept-ranges": "bytes",
    "cache-control": options.cacheControl ?? "no-store"
  };

  const range = parseRangeHeader(request.headers.range, stat.size);
  if (range?.unsatisfiable) {
    response.writeHead(416, {
      ...headers,
      "content-range": `bytes */${stat.size}`
    });
    response.end();
    return;
  }

  if (range) {
    const chunkSize = range.end - range.start + 1;
    headers["content-length"] = chunkSize;
    headers["content-range"] = `bytes ${range.start}-${range.end}/${stat.size}`;
    response.writeHead(206, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(response);
    return;
  }

  headers["content-length"] = stat.size;
  response.writeHead(200, headers);

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

export function createServer(options = {}) {
  const config = resolveConfig(options);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathname = safeDecode(url.pathname);

      if (pathname === "/healthz") {
        sendJson(response, 200, {
          ok: true,
          service: "codex-web-app",
          now: new Date().toISOString()
        });
        return;
      }

      if (pathname === "/api/files") {
        const files = await listDownloadEntries(config);
        sendJson(response, 200, {
          files,
          total: files.length
        });
        return;
      }

      if (pathname === "/") {
        await streamFile(request, response, config.indexFile, { cacheControl: "no-cache" });
        return;
      }

      if (pathname === "/Codex.dmg") {
        const legacyPath = path.join(config.rootDir, "Codex.dmg");
        try {
          const stat = await asFileStat(legacyPath);
          if (stat) {
            await streamFile(request, response, legacyPath, { cacheControl: "no-cache" });
            return;
          }
        } catch {
          // Fall through to downloads fallback.
        }

        const fallbackPath = path.join(config.downloadsDir, "Codex.dmg");
        await streamFile(request, response, fallbackPath, { cacheControl: "no-cache" });
        return;
      }

      if (pathname.startsWith("/assets/")) {
        const relativePath = pathname.slice("/assets/".length);
        const filePath = safeJoin(config.assetsDir, relativePath);
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await streamFile(request, response, filePath, { cacheControl: "public, max-age=300" });
        return;
      }

      if (pathname.startsWith("/downloads/")) {
        const relativePath = pathname.slice("/downloads/".length);
        const filePath = safeJoin(config.downloadsDir, relativePath);
        if (!filePath) {
          sendText(response, 403, "Forbidden");
          return;
        }
        await streamFile(request, response, filePath, { cacheControl: "no-cache" });
        return;
      }

      sendText(response, 404, "Not found");
    } catch (error) {
      if (!config.quiet) {
        console.error("Request error:", error);
      }
      sendText(response, 500, "Internal server error");
    }
  });

  server.on("clientError", (error, socket) => {
    if (!config.quiet) {
      console.warn("Client error:", error.message);
    }
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  server.codexConfig = config;
  return server;
}

export async function startServer(options = {}) {
  const config = resolveConfig(options);
  await fsp.mkdir(config.downloadsDir, { recursive: true });

  const server = createServer(config);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });

  return { server, config };
}

export async function stopServer(server) {
  if (!server?.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function getBindableUrls(server, hostOverride = "127.0.0.1") {
  const address = server.address();
  if (!address || typeof address === "string") {
    return [];
  }

  const urls = new Set();
  const localhost = hostOverride || "127.0.0.1";
  urls.add(`http://${localhost}:${address.port}/`);

  for (const value of Object.values(os.networkInterfaces())) {
    for (const detail of value ?? []) {
      if (detail.family !== "IPv4" || detail.internal) {
        continue;
      }
      urls.add(`http://${detail.address}:${address.port}/`);
    }
  }

  return Array.from(urls);
}
