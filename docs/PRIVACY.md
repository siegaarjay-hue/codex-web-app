# Privacy Notes

This repository is designed to avoid storing personal credentials and private chat content.

## Current safeguards

- Capture workflow uses isolated runtime folders:
  - `.runtime/capture-literal-state`
  - `.runtime/capture-workspace`
- README media is generated from the isolated capture workspace, not your personal history.
- Runtime and temporary logs are gitignored (`.runtime/`, `*.log`).
- CI includes checks for repository integrity and media references.

## Maintainer checklist before publishing

1. Run `npm run check`.
2. Verify `docs/media/capture-meta.json` contains no local absolute filesystem paths.
3. Manually review new screenshots/GIF/MP4 before committing.
4. Never commit tokens, API keys, or account cookies.
