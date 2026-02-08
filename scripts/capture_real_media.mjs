#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "/data/data/com.termux/files/home/node_modules/playwright-core/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const MEDIA_DIR = path.join(PROJECT_ROOT, "docs", "media");
const FRAMES_DIR = path.join(MEDIA_DIR, "real-frames");

const URL = process.env.CODEX_CAPTURE_URL ?? "http://127.0.0.1:6070/";
const CHROME_PATH =
  process.env.CHROMIUM_PATH ??
  "/data/data/com.termux/files/home/.cache/ms-playwright/chromium-1208/chrome-linux/chrome";

const FRAME_COUNT = 12;

async function ensureDir() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
}

async function waitUntil(check, { timeoutMs = 45_000, intervalMs = 250, label = "condition" } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function isVisibleText(page, pattern) {
  try {
    return await page.getByText(pattern).first().isVisible();
  } catch {
    return false;
  }
}

async function waitForTextVisible(page, pattern, timeoutMs = 25_000, label = `${pattern}`) {
  await waitUntil(() => isVisibleText(page, pattern), { timeoutMs, intervalMs: 250, label });
}

async function hasVisibleSpinner(page) {
  return page.evaluate(() => {
    const root = document.querySelector("#root") ?? document.body;
    if (!root) return false;

    const nodes = root.querySelectorAll(
      '.animate-spin, [class*="spinner"], [aria-busy="true"], [data-loading="true"]'
    );

    return Array.from(nodes).some((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const hidden = style.display === "none" || style.visibility === "hidden" || style.opacity === "0";
      return !hidden && rect.width > 0 && rect.height > 0;
    });
  });
}

async function waitForSpinnerGone(page, timeoutMs = 45_000) {
  let stableCount = 0;
  await waitUntil(
    async () => {
      const spinning = await hasVisibleSpinner(page);
      stableCount = spinning ? 0 : stableCount + 1;
      return stableCount >= 4;
    },
    { timeoutMs, intervalMs: 250, label: "spinner to disappear" }
  );
}

async function isSidebarOpen(page) {
  const automationsVisible = await isVisibleText(page, /Automations/i);
  const skillsVisible = await isVisibleText(page, /Skills/i);
  return automationsVisible && skillsVisible;
}

async function clickSidebarToggle(page) {
  await page.mouse.click(20, 20).catch(() => {});
}

async function clickOutsideSidebar(page) {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const x = Math.max(Math.floor(viewport.width * 0.75), 12);
  const y = Math.max(Math.floor(viewport.height * 0.45), 12);
  await page.mouse.click(x, y).catch(() => {});
}

async function isRightPaneOpen(page) {
  return isVisibleText(page, /Uncommitted changes/i);
}

async function ensureRightPaneClosed(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!(await isRightPaneOpen(page))) {
      return true;
    }
    await page.keyboard.press("Escape").catch(() => {});
    await clickOutsideSidebar(page);
    await page.waitForTimeout(180);
  }
  return !(await isRightPaneOpen(page));
}

async function waitForHomeReady(page) {
  await waitUntil(
    async () => (await isVisibleText(page, /Let.?s build/i)) || (await isVisibleText(page, /New thread/i)),
    { timeoutMs: 40_000, intervalMs: 250, label: "home surface to appear" }
  );
  await waitForSpinnerGone(page, 35_000).catch(() => {});
}

async function waitForSidebarReady(page) {
  await waitForTextVisible(page, /Automations/i, 25_000, "sidebar automations");
  await waitForTextVisible(page, /Threads/i, 25_000, "sidebar threads");
  await waitForSpinnerGone(page, 35_000);
}

async function ensureSidebarOpen(page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await ensureRightPaneClosed(page);

    if (await isSidebarOpen(page)) {
      await waitForSidebarReady(page);
      return true;
    }

    await clickSidebarToggle(page);
    await page.waitForTimeout(220);

    if (await isSidebarOpen(page)) {
      await waitForSidebarReady(page);
      return true;
    }
  }

  return false;
}

async function ensureSidebarClosed(page) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await ensureRightPaneClosed(page);

    if (!(await isSidebarOpen(page))) {
      await waitForSpinnerGone(page, 10_000);
      return true;
    }

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(180);

    if (!(await isSidebarOpen(page))) {
      await waitForSpinnerGone(page, 10_000);
      return true;
    }

    await clickSidebarToggle(page);
    await page.waitForTimeout(180);
  }

  return false;
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { cwd: PROJECT_ROOT, encoding: "utf8" });
  return {
    ok: result.status === 0,
    status: result.status,
    stderr: result.stderr || "",
  };
}

async function buildAnimatedMedia() {
  const mp4Path = path.join(MEDIA_DIR, "real-mobile-sidebar-demo.mp4");
  const gifPath = path.join(MEDIA_DIR, "real-mobile-sidebar-demo.gif");
  const palettePath = path.join(MEDIA_DIR, "real-mobile-sidebar-palette.png");

  const mp4 = runFfmpeg([
    "-y",
    "-framerate",
    "3",
    "-i",
    "docs/media/real-frames/frame-%02d.png",
    "-vf",
    "format=yuv420p",
    mp4Path,
  ]);

  if (!mp4.ok) {
    return { ok: false, stage: "mp4", stderr: mp4.stderr.trim().slice(0, 2000) };
  }

  const palette = runFfmpeg([
    "-y",
    "-i",
    mp4Path,
    "-vf",
    "fps=8,scale=390:-1:flags=lanczos,palettegen",
    palettePath,
  ]);

  if (!palette.ok) {
    return { ok: false, stage: "palette", stderr: palette.stderr.trim().slice(0, 2000) };
  }

  const gif = runFfmpeg([
    "-y",
    "-i",
    mp4Path,
    "-i",
    palettePath,
    "-lavfi",
    "fps=8,scale=390:-1:flags=lanczos[x];[x][1:v]paletteuse",
    gifPath,
  ]);

  await fs.rm(palettePath, { force: true });

  if (!gif.ok) {
    return { ok: false, stage: "gif", stderr: gif.stderr.trim().slice(0, 2000) };
  }

  return { ok: true, mp4Path, gifPath };
}

async function capture() {
  await ensureDir();
  await fs.rm(FRAMES_DIR, { recursive: true, force: true });
  await fs.mkdir(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const meta = {
    url: URL,
    capturedAt: new Date().toISOString(),
    states: {},
  };

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    await desktop.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForHomeReady(desktop);
    await desktop.screenshot({ path: path.join(MEDIA_DIR, "real-desktop-home.png"), fullPage: true });

    const desktopSidebarOpened = await ensureSidebarOpen(desktop);
    if (!desktopSidebarOpened) {
      throw new Error("Could not open desktop sidebar reliably");
    }
    await desktop.screenshot({ path: path.join(MEDIA_DIR, "real-desktop-sidebar.png"), fullPage: true });

    const desktopSidebarClosed = await ensureSidebarClosed(desktop);

    meta.states.desktop = {
      sidebarOpened: desktopSidebarOpened,
      sidebarClosed: desktopSidebarClosed,
    };

    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForHomeReady(mobile);
    await mobile.screenshot({ path: path.join(MEDIA_DIR, "real-mobile-home.png"), fullPage: true });

    const mobileSidebarOpened = await ensureSidebarOpen(mobile);
    if (!mobileSidebarOpened) {
      throw new Error("Could not open mobile sidebar reliably");
    }
    await mobile.screenshot({ path: path.join(MEDIA_DIR, "real-mobile-sidebar-open.png"), fullPage: true });

    const mobileSidebarClosed = await ensureSidebarClosed(mobile);
    if (!mobileSidebarClosed) {
      throw new Error("Could not close mobile sidebar reliably");
    }

    for (let i = 0; i < FRAME_COUNT; i += 1) {
      if (i % 2 === 0) {
        await ensureSidebarOpen(mobile);
      } else {
        await ensureSidebarClosed(mobile);
      }
      await mobile.waitForTimeout(220);
      await mobile.screenshot({
        path: path.join(FRAMES_DIR, `frame-${String(i).padStart(2, "0")}.png`),
        fullPage: true,
      });
    }

    await mobile.close();

    meta.states.mobile = {
      sidebarOpened: mobileSidebarOpened,
      sidebarClosed: mobileSidebarClosed,
      frames: FRAME_COUNT,
    };

    meta.animation = await buildAnimatedMedia();
    await fs.writeFile(path.join(MEDIA_DIR, "real-capture-meta.json"), JSON.stringify(meta, null, 2));

    console.log("Real capture complete");
    console.log(JSON.stringify(meta, null, 2));
  } finally {
    await browser.close();
  }
}

capture().catch((error) => {
  console.error(`capture failed: ${error?.stack || error}`);
  process.exit(1);
});
