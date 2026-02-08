import assert from "node:assert/strict";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { after, before, test } from "node:test";

import { startServer, stopServer } from "../scripts/server.mjs";

let server;
let baseUrl;
let tempDownloadsDir;
const fixtureName = "test-file.bin";
const fixtureBytes = Buffer.from("codex-web-app-test-data");
const fixtureSha = crypto.createHash("sha256").update(fixtureBytes).digest("hex");

before(async () => {
  tempDownloadsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "codex-web-test-"));
  await fsp.writeFile(path.join(tempDownloadsDir, fixtureName), fixtureBytes);

  const { server: active } = await startServer({
    host: "127.0.0.1",
    port: 0,
    rootDir: process.cwd(),
    downloadsDir: tempDownloadsDir,
    quiet: true
  });

  server = active;
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await stopServer(server);
  await fsp.rm(tempDownloadsDir, { recursive: true, force: true });
});

test("health endpoint returns ok payload", async () => {
  const response = await fetch(`${baseUrl}/healthz`, { headers: { accept: "application/json" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
});

test("manifest includes fixture metadata", async () => {
  const response = await fetch(`${baseUrl}/api/files`, { headers: { accept: "application/json" } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const entry = payload.files.find((file) => file.name === fixtureName);
  assert.ok(entry);
  assert.equal(entry.sha256, fixtureSha);
  assert.equal(entry.size, fixtureBytes.length);
});

test("download endpoint supports range responses", async () => {
  const response = await fetch(`${baseUrl}/downloads/${fixtureName}`, {
    headers: { range: "bytes=0-4" }
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 0-4/${fixtureBytes.length}`);
  const chunk = Buffer.from(await response.arrayBuffer());
  assert.equal(chunk.toString("utf8"), "codex");
});

test("path traversal is blocked", async () => {
  const response = await fetch(`${baseUrl}/downloads/..%2Fpackage.json`);
  assert.equal(response.status, 403);
});
