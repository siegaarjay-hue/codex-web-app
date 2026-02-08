# Codex Web App

Website version of the Codex app, packaged as a standalone local repo.

This repository contains:

- The full web UI bundle (`index.html`, `assets/`, `apps/`, `colorcons/`)
- Mobile UI/UX overrides (`assets/mobile-overrides.css`)
- Local runtime controls (`start`, `stop`, `status`, `selftest`)

## Requirements

- Node.js 20+

## Start

```bash
cd codex-web-app
npm install
npm run start
```

Open:

`http://127.0.0.1:8000/`

## Commands

```bash
npm run serve      # run in foreground
npm run start      # run in background
npm run status     # show runtime state
npm run stop       # stop background server
npm run selftest   # run end-to-end checks
npm run test       # run unit tests
npm run check      # test + selftest
```

## Direct Script Shortcuts

```bash
./start.sh
./stop.sh
./serve.sh
./selftest.sh
```

## Health Check

```bash
curl -s http://127.0.0.1:8000/healthz
```
