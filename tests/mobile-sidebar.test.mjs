#!/usr/bin/env node
/**
 * Visual regression test for mobile sidebar behavior.
 *
 * Captures two states at viewport 390×844 (sidebar closed and sidebar open)
 * and compares against stored baseline snapshots under tests/snapshots/mobile/.
 * Fails with a clear message if the pixel diff exceeds a small threshold.
 *
 * Usage:
 *   node tests/mobile-sidebar.test.mjs
 *
 * Baselines are stored in tests/snapshots/mobile/. To regenerate baselines,
 * delete the existing PNGs and run this script — it will save new baselines
 * on the first run and skip comparison.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

import { startServer, stopServer } from "../scripts/server.mjs";

const PROJECT_ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(PROJECT_ROOT, "tests", "snapshots", "mobile");
const BASELINE_CLOSED = path.join(SNAPSHOT_DIR, "sidebar-closed.png");
const BASELINE_OPEN = path.join(SNAPSHOT_DIR, "sidebar-open.png");

const VIEWPORT = { width: 390, height: 844 };
const DIFF_THRESHOLD = 0.02; // 2 % pixel difference allowed

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute a simple byte-level diff ratio between two same-size PNG buffers.
 * This is intentionally lightweight — no external image-diff library needed.
 * It compares raw buffer bytes; because PNGs of the same dimensions from the
 * same renderer are structurally similar, this catches meaningful regressions.
 */
function bufferDiffRatio(a, b) {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 1;
  let diffBytes = Math.abs(a.length - b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) diffBytes++;
  }
  return diffBytes / Math.max(a.length, b.length);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    // fall through
  }
  try {
    return await import("playwright-core");
  } catch {
    // fall through
  }
  return null;
}

test("mobile sidebar does not overlap chat surface (visual regression)", async (t) => {
  const pw = await loadPlaywright();
  if (!pw || !pw.chromium) {
    t.skip("Playwright not installed — skipping visual regression test");
    return;
  }

  // Start the app server on a random port.
  const { server } = await startServer({
    host: "127.0.0.1",
    port: 0,
    rootDir: PROJECT_ROOT,
    downloadsDir: path.join(PROJECT_ROOT, "downloads"),
    quiet: true,
  });

  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 15_000 });
    await page.waitForTimeout(500);

    // --- Capture sidebar-closed state ---
    const closedBuf = await page.screenshot({ fullPage: false });
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

    if (!(await fileExists(BASELINE_CLOSED))) {
      await fs.writeFile(BASELINE_CLOSED, closedBuf);
      console.log("  ✎ Saved new baseline: sidebar-closed.png");
    } else {
      const baseline = await fs.readFile(BASELINE_CLOSED);
      const ratio = bufferDiffRatio(baseline, closedBuf);
      assert.ok(
        ratio <= DIFF_THRESHOLD,
        `sidebar-closed screenshot differs from baseline by ${(ratio * 100).toFixed(1)}% (threshold ${DIFF_THRESHOLD * 100}%)`
      );
    }

    // --- Open sidebar ---
    await page.mouse.click(20, 20);
    await page.waitForTimeout(400);

    // --- Capture sidebar-open state ---
    const openBuf = await page.screenshot({ fullPage: false });

    if (!(await fileExists(BASELINE_OPEN))) {
      await fs.writeFile(BASELINE_OPEN, openBuf);
      console.log("  ✎ Saved new baseline: sidebar-open.png");
    } else {
      const baseline = await fs.readFile(BASELINE_OPEN);
      const ratio = bufferDiffRatio(baseline, openBuf);
      assert.ok(
        ratio <= DIFF_THRESHOLD,
        `sidebar-open screenshot differs from baseline by ${(ratio * 100).toFixed(1)}% (threshold ${DIFF_THRESHOLD * 100}%)`
      );
    }
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
});
