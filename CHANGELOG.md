# Changelog

## 1.1.0 - 2026-02-08

- Replaced stylized README visuals with literal bridge captures.
- Added media capture pipeline (`scripts/capture_media.mjs`) with GIF and MP4 output.
- Switched showcase motion from sidebar history to message composer type-and-send flow with visible demo cursor.
- Added README media integrity check (`scripts/check-readme-media.mjs`) and wired it into `npm run check`.
- Created and pinned `good first issue` tasks for contributor onboarding.
- Added public-readiness guardrail check (`scripts/check-public-ready.mjs`) for required community files and local-path leaks.
- Added `CODE_OF_CONDUCT.md` and `docs/PRIVACY.md` for open-source publication readiness.
- Updated CI workflow and documentation to target `main`.

## 1.0.0 - 2026-02-08

- Initial standalone repository created.
- Mobile override CSS included.
- Runtime controls added (`start`, `stop`, `status`, `selftest`).
- Server tests and selftest pipeline included.
- GitHub Actions CI added.
