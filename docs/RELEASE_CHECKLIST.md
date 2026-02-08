# Release Checklist

## Pre-release

- [ ] `npm run test`
- [ ] `npm run selftest`
- [ ] Mobile layout sanity check at 360px, 390px, 430px, and 540px widths
- [ ] README updated for user-facing changes
- [ ] Changelog entry added

## Release

- [ ] Create tag (`vX.Y.Z`)
- [ ] Publish release notes from changelog
- [ ] Verify CI green on tagged commit

## Post-release

- [ ] Smoke test startup commands
- [ ] Verify `healthz` endpoint payload
- [ ] Triage incoming issues
