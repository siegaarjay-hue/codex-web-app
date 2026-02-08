#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const README_PATH = path.join(PROJECT_ROOT, "README.md");

const BANNED_MEDIA = [
  "docs/media/hero-card.png",
  "docs/media/repo-showcase.png",
  "docs/media/desktop-overview.png",
  "docs/media/mobile-overview.png",
  "docs/media/mobile-sidebar-open.png",
  "docs/media/mobile-sidebar-demo.gif",
];

function unique(values) {
  return [...new Set(values)];
}

function getReadmeMediaPaths(text) {
  const imageOrLinkRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;
  const matches = [];
  let match = imageOrLinkRegex.exec(text);
  while (match) {
    const raw = (match[1] || "").trim();
    if (raw.startsWith("docs/media/")) {
      matches.push(raw);
    }
    match = imageOrLinkRegex.exec(text);
  }
  return unique(matches);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const readme = await fs.readFile(README_PATH, "utf8");
  const paths = getReadmeMediaPaths(readme);

  if (paths.length === 0) {
    throw new Error("README does not reference any docs/media assets.");
  }

  const missing = [];
  for (const relativePath of paths) {
    const absolutePath = path.join(PROJECT_ROOT, relativePath);
    if (!(await fileExists(absolutePath))) {
      missing.push(relativePath);
    }
  }

  const bannedUsed = BANNED_MEDIA.filter((entry) => readme.includes(entry));
  const hasRealMp4 = paths.includes("docs/media/real-mobile-sidebar-demo.mp4");

  if (missing.length > 0) {
    throw new Error(`Missing media files referenced in README: ${missing.join(", ")}`);
  }

  if (bannedUsed.length > 0) {
    throw new Error(`README still references legacy generated media: ${bannedUsed.join(", ")}`);
  }

  if (!hasRealMp4) {
    throw new Error("README must reference docs/media/real-mobile-sidebar-demo.mp4");
  }

  console.log(`README media check passed (${paths.length} media references validated).`);
}

main().catch((error) => {
  console.error(`README media check failed: ${error.message}`);
  process.exit(1);
});
