# Contributing

Thanks for helping improve this project.

## 10-Minute First Contribution Path

1. Pick a starter ticket from the `good first issue` set in `README.md`.
2. Run setup and checks locally:

```bash
npm install
npm run check
```

3. Make one focused change and re-run `npm run check`.
4. Open a PR using `.github/pull_request_template.md`.

## Setup

```bash
npm install
npm run check
```

## Development Rules

- Keep changes scoped and small.
- Add or update tests for behavior changes.
- Preserve mobile responsiveness.
- Do not commit secrets or tokens.

## Pull Request Checklist

- [ ] `npm run test` passes
- [ ] `npm run selftest` passes
- [ ] `npm run check:public` passes
- [ ] Docs updated when behavior changes
- [ ] No broken mobile layout

## Commit Style

Use clear, action-focused messages, for example:

- `fix: prevent sidebar overlap on small screens`
- `test: add regression for ranged downloads`
- `docs: clarify startup and troubleshooting`
