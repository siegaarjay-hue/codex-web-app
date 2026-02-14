# Contributing

Thanks for helping improve this project! This guide is designed to get you from zero to your first PR in about 10 minutes.

---

## ⚡ Quick Start (10 minutes)

1. **Fork & clone** the repository:
   ```bash
   git clone https://github.com/<your-user>/codex-web-app.git
   cd codex-web-app
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Run the full check pipeline** (must pass before any PR):
   ```bash
   npm run check
   ```
   This runs: `test` → `selftest` → `check:public` → `check:media`.
4. **Pick a starter issue** from the `good first issue` list in `README.md`.
5. **Make one focused change**, re-run `npm run check`, and open a PR.

---

## 🛠️ Setup

```bash
npm install
npm run check
```

Node.js ≥ 20 is required (see `.nvmrc`).

---

## 📐 Development Rules

- Keep changes scoped and small.
- Add or update tests for behavior changes.
- Preserve mobile responsiveness.
- Do not commit secrets or tokens.

---

## 📱 Mobile Validation Checklist

Before opening a PR that touches UI or layout, verify at mobile widths:

- [ ] Test at viewport **390×844** (iPhone 14 / 15 size)
- [ ] Sidebar opens without overlapping the chat surface
- [ ] Sidebar closes cleanly — no lingering overlay
- [ ] Composer input is fully visible and usable
- [ ] No horizontal scroll at 360px, 390px, and 430px widths

You can run the automated visual regression check (requires Playwright):

```bash
node tests/mobile-sidebar.test.mjs
```

---

## ✅ Pull Request Checklist

All of these commands **must pass** before opening a PR:

- [ ] `npm run test` — unit and integration tests
- [ ] `npm run selftest` — end-to-end validation
- [ ] `npm run check:public` — public-readiness guardrails
- [ ] `npm run check:media` — README media references are valid
- [ ] Docs updated when behavior changes
- [ ] No broken mobile layout (see checklist above)

Or simply run the full pipeline:

```bash
npm run check
```

---

## 💬 Commit Style

Use clear, action-focused messages:

- `fix: prevent sidebar overlap on small screens`
- `test: add regression for ranged downloads`
- `docs: clarify startup and troubleshooting`
