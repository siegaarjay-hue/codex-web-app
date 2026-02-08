#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();

const REQUIRED_FILES = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  ".github/workflows/ci.yml",
];

const SCAN_TOP_LEVEL = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "package.json",
  "package-lock.json",
  ".gitignore",
  "NOTICE",
];

const SCAN_DIRS = [".github", "docs", "scripts", "tests"];

const LOCAL_PATH_PATTERNS = [
  /\/data\/data\/com\.termux\/files\/home/gi,
  /\/Users\/[A-Za-z0-9._-]+\//g,
  /C:\\Users\\[A-Za-z0-9._-]+\\/g,
  /\/tmp\/codex-[A-Za-z0-9._-]+/g,
];

const SKIP_DIRS = new Set([".git", ".runtime", "node_modules"]);
const SKIP_RELATIVE = new Set(["scripts/check-public-ready.mjs"]);
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".mp4",
  ".woff",
  ".woff2",
  ".ttf",
  ".webp",
  ".ico",
  ".zip",
]);

async function exists(relativePath) {
  try {
    await fs.access(path.join(PROJECT_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".DS_Store")) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(PROJECT_ROOT, full).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectFiles(full, out);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;
    out.push(rel);
  }
  return out;
}

async function collectScanTargets() {
  const out = [];
  for (const top of SCAN_TOP_LEVEL) {
    if (await exists(top)) {
      out.push(top);
    }
  }

  for (const dir of SCAN_DIRS) {
    if (!(await exists(dir))) continue;
    const absoluteDir = path.join(PROJECT_ROOT, dir);
    await collectFiles(absoluteDir, out);
  }

  return [...new Set(out)].filter((file) => !SKIP_RELATIVE.has(file));
}

function findPathLeaks(content) {
  const leaks = [];
  for (const regex of LOCAL_PATH_PATTERNS) {
    regex.lastIndex = 0;
    let match = regex.exec(content);
    while (match) {
      leaks.push(match[0]);
      match = regex.exec(content);
    }
  }
  return [...new Set(leaks)];
}

function linesWithAny(text, values) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, idx) => {
    for (const value of values) {
      if (line.includes(value)) {
        hits.push(`${idx + 1}: ${line.trim()}`);
        break;
      }
    }
  });
  return hits;
}

async function main() {
  const missing = [];
  for (const file of REQUIRED_FILES) {
    if (!(await exists(file))) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required public files: ${missing.join(", ")}`);
  }

  const security = await fs.readFile(path.join(PROJECT_ROOT, "SECURITY.md"), "utf8");
  if (!/\bmain\b/.test(security)) {
    throw new Error('SECURITY.md must document "main" as the supported branch.');
  }

  const files = await collectScanTargets();
  const findings = [];
  for (const relative of files) {
    const absolute = path.join(PROJECT_ROOT, relative);
    let content;
    try {
      content = await fs.readFile(absolute, "utf8");
    } catch {
      continue;
    }

    const leaks = findPathLeaks(content);
    if (leaks.length === 0) continue;

    const lineHits = linesWithAny(content, leaks);
    findings.push({
      file: relative,
      leaks,
      lineHits,
    });
  }

  if (findings.length > 0) {
    const summary = findings
      .map((entry) => {
        const lines = entry.lineHits.slice(0, 3).join(" | ");
        return `- ${entry.file}: ${entry.leaks.join(", ")}${lines ? ` (${lines})` : ""}`;
      })
      .join("\n");
    throw new Error(`Found local path leaks that reduce public portability:\n${summary}`);
  }

  console.log(`Public readiness check passed (${files.length} text files scanned).`);
}

main().catch((error) => {
  console.error(`Public readiness check failed: ${error.message}`);
  process.exit(1);
});
