# Codex Web App

![CI](https://github.com/siegaarjay-hue/codex-web-app/actions/workflows/ci.yml/badge.svg?branch=main)
![Node](https://img.shields.io/badge/node-20%2B-2b9348)
![Mobile](https://img.shields.io/badge/mobile-first%20UX-1d4ed8)
![License](https://img.shields.io/badge/license-MIT-0f766e)

Community-built Codex-style web app runtime with mobile-oriented behavior and local tooling.

![Desktop Home](docs/media/desktop-home.png)

## Quick Start

```bash
git clone https://github.com/siegaarjay-hue/codex-web-app.git
cd codex-web-app
npm install
npm run start
```

Open `http://127.0.0.1:8000/` and run `npm run status` to verify runtime health.

Stop anytime:

```bash
npm run stop
```

## What's Included

- Mobile-first UI with responsive behavior for desktop and phone widths.
- Sidebar and panel handling tuned to avoid overlap in small viewports.
- Runtime controls: `start`, `stop`, `status`, `selftest`.
- CI checks on every push and pull request to `main`.
- Contributor docs, issue templates, and release checklist.
- Public safety docs: `SECURITY.md`, `CODE_OF_CONDUCT.md`, `docs/PRIVACY.md`.

## UI Preview

### Desktop
![Desktop Home](docs/media/desktop-home.png)

### Mobile
![Mobile Home](docs/media/mobile-home.png)
![Mobile Composer](docs/media/mobile-composer.png)

## Commands

```bash
npm run serve         # run in foreground
npm run start         # run in background
npm run status        # show runtime state
npm run stop          # stop background process
npm run test          # node unit/integration tests
npm run selftest      # end-to-end command health check
npm run check:public  # verify public-readiness guardrails
npm run check         # test + selftest + public validation
```

## Good First Issues

- [#1 Add visual regression test for mobile sidebar behavior](https://github.com/siegaarjay-hue/codex-web-app/issues/1)
- [#4 Improve first-time contributor experience in CONTRIBUTING.md](https://github.com/siegaarjay-hue/codex-web-app/issues/4)

## CI Quality Gate

GitHub Actions runs on every push and pull request to `main`:

- `npm ci`
- `npm run check`

Workflow file: `.github/workflows/ci.yml`

## Project Layout

- `index.html`: app entrypoint
- `assets/`: bundled JS/CSS/fonts/images
- `scripts/server.mjs`: static + API server
- `scripts/codex-web.mjs`: runtime command wrapper
- `scripts/check-public-ready.mjs`: public-readiness guardrail checks
- `tests/server.test.mjs`: API and security regression tests

## API Endpoints

- `GET /healthz`: liveness payload with service name + timestamp
- `GET /api/files`: download manifest with SHA256 and metadata
- `GET|HEAD /downloads/:file`: static download with range support

## Trust, Legal, and Sources

- Research references: `docs/RESEARCH.md`
- Legal and attribution: `docs/LEGAL.md`
- Notice file: `NOTICE`
- Privacy notes: `docs/PRIVACY.md`

## Contributing

Before opening a PR:

1. Run `npm run check`
2. Validate behavior at mobile widths (360px, 390px, 430px)
3. Update docs when behavior changes

Full guide: `CONTRIBUTING.md`

## Roadmap and Release Process

- Roadmap: `docs/ROADMAP.md`
- Release checklist: `docs/RELEASE_CHECKLIST.md`
- Changelog: `CHANGELOG.md`

## Security

Please report vulnerabilities through `SECURITY.md`.
