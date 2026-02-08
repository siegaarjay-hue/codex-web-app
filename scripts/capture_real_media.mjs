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
const FRAMES_DIR = path.join(MEDIA_DIR, "real-message-frames");

const URL = process.env.CODEX_CAPTURE_URL ?? "http://127.0.0.1:6070/";
const CHROME_PATH =
  process.env.CHROMIUM_PATH ??
  "/data/data/com.termux/files/home/.cache/ms-playwright/chromium-1208/chrome-linux/chrome";

const OUTPUT = {
  desktopHome: "real-desktop-home.png",
  mobileHome: "real-mobile-home.png",
  mobileComposer: "real-mobile-composer.png",
  demoMp4: "real-message-demo.mp4",
  demoGif: "real-message-demo.gif",
};

const PROMPT_TEXT = "Write a 3-bullet mobile UX summary for this app.";
const FRAME_STEPS = 12;

async function ensureDir() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
}

async function waitUntil(check, { timeoutMs = 45_000, intervalMs = 250, label = "condition" } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
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

async function waitForSpinnerGone(page, timeoutMs = 35_000) {
  let stable = 0;
  await waitUntil(
    async () => {
      const spinning = await hasVisibleSpinner(page);
      stable = spinning ? 0 : stable + 1;
      return stable >= 4;
    },
    { timeoutMs, intervalMs: 200, label: "spinner to disappear" }
  );
}

async function isSidebarOpen(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".w-token-sidebar");
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) <= 0.05) return false;
    if (style.pointerEvents === "none") return false;
    return rect.width > 120 && rect.x > -rect.width + 24;
  });
}

async function clickSidebarToggle(page) {
  await page.mouse.click(20, 20).catch(() => {});
}

async function clickOutsidePanels(page) {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  await page.mouse.click(Math.floor(viewport.width * 0.6), Math.floor(viewport.height * 0.32)).catch(() => {});
}

async function clickVisibleButton(page, namePattern) {
  try {
    const button = page.getByRole("button", { name: namePattern }).first();
    if (await button.isVisible()) {
      await button.click({ force: true });
      return true;
    }
  } catch {
    // No-op.
  }
  return false;
}

async function isRightPaneOpen(page) {
  return page.evaluate(() => {
    const panes = Array.from(document.querySelectorAll(".main-surface.z-30"));
    return panes.some((pane) => {
      const rect = pane.getBoundingClientRect();
      const style = window.getComputedStyle(pane);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (Number(style.opacity) <= 0.05) return false;
      if (style.pointerEvents === "none") return false;
      return rect.width > 100 && rect.x < window.innerWidth - 20;
    });
  });
}

async function isTerminalVisible(page) {
  return page.evaluate(() => {
    const panel = document.querySelector("#bottom-panel-open");
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    const style = window.getComputedStyle(panel);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) <= 0.05) return false;
    if (style.pointerEvents === "none") return false;
    return rect.height > 60 && rect.y < window.innerHeight - 40;
  });
}

async function ensureTerminalClosed(page) {
  for (let i = 0; i < 6; i += 1) {
    if (!(await isTerminalVisible(page))) {
      return true;
    }
    const closeClicked = await clickVisibleButton(page, /Close terminal/i);
    if (!closeClicked) {
      await clickVisibleButton(page, /Toggle terminal/i);
    }
    await page.keyboard.press("Escape").catch(() => {});
    await clickOutsidePanels(page);
    await page.waitForTimeout(220);
  }
  return !(await isTerminalVisible(page));
}

async function ensureRightPaneClosed(page) {
  for (let i = 0; i < 5; i += 1) {
    if (!(await isRightPaneOpen(page))) {
      return true;
    }
    await page.keyboard.press("Escape").catch(() => {});
    await clickOutsidePanels(page);
    await page.waitForTimeout(180);
  }
  return !(await isRightPaneOpen(page));
}

async function ensureSidebarClosed(page) {
  for (let i = 0; i < 8; i += 1) {
    await ensureRightPaneClosed(page);
    if (!(await isSidebarOpen(page))) {
      return true;
    }
    await page.keyboard.press("Escape").catch(() => {});
    await clickOutsidePanels(page);
    await page.waitForTimeout(180);
    if (!(await isSidebarOpen(page))) {
      return true;
    }
    await clickSidebarToggle(page);
    await page.waitForTimeout(180);
  }
  return !(await isSidebarOpen(page));
}

async function hardResetPanels(page) {
  for (let i = 0; i < 10; i += 1) {
    if (await isSidebarOpen(page)) {
      await clickVisibleButton(page, /Hide sidebar/i);
    }
    if (await isRightPaneOpen(page)) {
      await clickVisibleButton(page, /Toggle diff panel/i);
    }
    if (await isTerminalVisible(page)) {
      await ensureTerminalClosed(page);
    }
    await page.keyboard.press("Escape").catch(() => {});
    await clickOutsidePanels(page);
    await page.waitForTimeout(200);
    if (!(await isSidebarOpen(page)) && !(await isRightPaneOpen(page)) && !(await isTerminalVisible(page))) {
      break;
    }
  }
  await ensureRightPaneClosed(page);
  await ensureSidebarClosed(page);
  await ensureTerminalClosed(page);
}

async function waitForHomeReady(page) {
  await waitUntil(
    async () => (await isVisibleText(page, /Let.?s build/i)) || (await isVisibleText(page, /New thread/i)),
    { timeoutMs: 40_000, intervalMs: 250, label: "home surface to appear" }
  );
  await waitForSpinnerGone(page).catch(() => {});
}

async function ensureGitRepoReady(page) {
  const button = page.getByRole("button", { name: /Create git repository/i }).first();
  if (!(await button.isVisible().catch(() => false))) {
    return;
  }
  await button.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
}

async function findComposerRect(page) {
  return page.evaluate(() => {
    const node = document.querySelector(".ProseMirror");
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      centerX: Math.round(rect.x + rect.width / 2),
      centerY: Math.round(rect.y + rect.height / 2),
      bottomY: Math.round(rect.y + rect.height),
    };
  });
}

async function ensureComposerReady(page) {
  await waitUntil(async () => (await findComposerRect(page)) !== null, {
    timeoutMs: 35_000,
    intervalMs: 200,
    label: "composer to appear",
  });
}

async function clickSendButton(page) {
  const clicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    let candidate = null;
    let bestScore = -Infinity;

    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      if (rect.width < 18 || rect.width > 48) continue;
      if (rect.height < 18 || rect.height > 48) continue;
      if (rect.y < viewportH - 130 || rect.y > viewportH - 20) continue;
      if (rect.x < viewportW - 90) continue;

      const score = rect.x * 2 + rect.y;
      if (score > bestScore) {
        bestScore = score;
        candidate = button;
      }
    }

    if (!candidate) return false;
    candidate.click();
    return true;
  });

  if (!clicked) {
    const viewport = page.viewportSize() ?? { width: 390, height: 844 };
    await page.mouse.click(viewport.width - 44, viewport.height - 82);
  }
}

async function ensureDemoCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById("codex-demo-cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "codex-demo-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.position = "fixed";
    cursor.style.left = "0px";
    cursor.style.top = "0px";
    cursor.style.width = "26px";
    cursor.style.height = "26px";
    cursor.style.pointerEvents = "none";
    cursor.style.zIndex = "2147483647";
    cursor.style.transform = "translate(24px, 24px) scale(1)";
    cursor.style.transition = "transform 160ms ease-out";
    cursor.innerHTML =
      '<svg viewBox="0 0 26 26" width="26" height="26" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 2 L12 23 L15 14 L24 11 Z" fill="#0f172a" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>' +
      "</svg>";
    document.body.append(cursor);
  });
}

async function setDemoCursor(page, x, y, pressed = false) {
  await page.evaluate(
    ({ cx, cy, down }) => {
      const cursor = document.getElementById("codex-demo-cursor");
      if (!cursor) return;
      cursor.style.transform = `translate(${cx}px, ${cy}px) scale(${down ? 0.92 : 1})`;
    },
    { cx: Math.round(x), cy: Math.round(y), down: pressed }
  );
}

async function removeDemoCursor(page) {
  await page.evaluate(() => {
    document.getElementById("codex-demo-cursor")?.remove();
  });
}

async function captureFrame(page, index) {
  const filename = `frame-${String(index).padStart(2, "0")}.png`;
  await page.screenshot({ path: path.join(FRAMES_DIR, filename), fullPage: true });
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { cwd: PROJECT_ROOT, encoding: "utf8" });
  return { ok: result.status === 0, stderr: result.stderr || "" };
}

async function buildAnimation() {
  const mp4Path = path.join(MEDIA_DIR, OUTPUT.demoMp4);
  const gifPath = path.join(MEDIA_DIR, OUTPUT.demoGif);
  const palettePath = path.join(MEDIA_DIR, "real-message-demo-palette.png");

  const mp4 = runFfmpeg([
    "-y",
    "-framerate",
    "4",
    "-i",
    "docs/media/real-message-frames/frame-%02d.png",
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
    "fps=10,scale=390:-1:flags=lanczos,palettegen",
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
    "fps=10,scale=390:-1:flags=lanczos[x];[x][1:v]paletteuse",
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
    outputs: OUTPUT,
  };

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    await desktop.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForHomeReady(desktop);
    await ensureGitRepoReady(desktop);
    await hardResetPanels(desktop);
    await desktop.screenshot({ path: path.join(MEDIA_DIR, OUTPUT.desktopHome), fullPage: true });
    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForHomeReady(mobile);
    await ensureGitRepoReady(mobile);
    await hardResetPanels(mobile);
    await ensureComposerReady(mobile);
    await mobile.screenshot({ path: path.join(MEDIA_DIR, OUTPUT.mobileHome), fullPage: true });

    await ensureDemoCursor(mobile);
    let frameIndex = 0;
    const composer = await findComposerRect(mobile);
    if (!composer) throw new Error("Composer not found.");

    const sendX = (mobile.viewportSize()?.width ?? 390) - 44;
    const sendY = (mobile.viewportSize()?.height ?? 844) - 82;
    const startX = 38;
    const startY = 120;

    await setDemoCursor(mobile, startX, startY, false);
    await captureFrame(mobile, frameIndex++);

    await setDemoCursor(mobile, composer.centerX - 10, composer.centerY - 8, false);
    await mobile.waitForTimeout(160);
    await captureFrame(mobile, frameIndex++);

    await hardResetPanels(mobile);
    await setDemoCursor(mobile, composer.centerX - 10, composer.centerY - 8, true);
    await mobile.locator(".ProseMirror").first().click({ force: true });
    await mobile.waitForTimeout(120);
    await setDemoCursor(mobile, composer.centerX - 10, composer.centerY - 8, false);
    await captureFrame(mobile, frameIndex++);

    const chunks = [
      "Write a 3-bullet",
      " mobile UX",
      " summary for",
      " this app.",
    ];

    for (const chunk of chunks) {
      await mobile.keyboard.type(chunk, { delay: 28 });
      await mobile.waitForTimeout(140);
      if (frameIndex < FRAME_STEPS - 3) {
        await captureFrame(mobile, frameIndex++);
      }
    }

    await mobile.screenshot({ path: path.join(MEDIA_DIR, OUTPUT.mobileComposer), fullPage: true });

    await setDemoCursor(mobile, sendX, sendY, false);
    await mobile.waitForTimeout(160);
    await captureFrame(mobile, frameIndex++);

    await setDemoCursor(mobile, sendX, sendY, true);
    await clickSendButton(mobile);
    await mobile.waitForTimeout(150);
    await setDemoCursor(mobile, sendX, sendY, false);
    await captureFrame(mobile, frameIndex++);

    await mobile.waitForTimeout(420);
    await captureFrame(mobile, frameIndex++);

    while (frameIndex < FRAME_STEPS) {
      await captureFrame(mobile, frameIndex++);
    }

    await removeDemoCursor(mobile);
    await mobile.close();

    meta.promptText = PROMPT_TEXT;
    meta.animation = await buildAnimation();
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
