# Online IDE — C++

A fast, dark, VS Code–style online IDE for C++, with a Node.js execution
engine that compiles and runs user code in an isolated, time-and-RAM-capped
child process. One Docker container, one command to run.

![tech](https://img.shields.io/badge/Node.js-20-3fb950?logo=node.js&logoColor=white)
![tech](https://img.shields.io/badge/g++-14-00599C?logo=c%2B%2B&logoColor=white)
![tech](https://img.shields.io/badge/Monaco-0.45-0078d4?logo=visualstudiocode&logoColor=white)
![tech](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

## Features

- **Monaco Editor** with C++ syntax highlighting, autocomplete, bracket
  pairing, minimap, and a custom dark theme that matches GitHub's palette.
- **Run** button + **F9** shortcut to compile and execute against custom stdin.
- **Sandboxed execution**: each run uses a unique temp dir, 2s wall-clock
  timeout (SIGKILL), 256 MB virtual-memory cap via `prlimit`, and 1 MB
  output buffer cap.
- **Rate-limited** API (30 req/min/IP), source code size-capped (64 KB).
- **Static frontend + single Node API**, served by Express — one container,
  one port (`8080`).
- **GitHub Actions** for Docker builds and Pages deployment to
  `ide.ankb.qzz.io` (set `IDE_API_BASE` env var to point the Pages frontend
  at a separate backend host).
- **Custom right-click context menu** with Run, Format, Reset, Clear Input,
  Clear Output, Copy Output, Reload, About. Items are context-aware
  (show "Editor", "Input", "Output" depending on where you right-click).
- **DevTools-detection warning banner** (size + console + debugger heuristics,
  refreshed every 800 ms). When DevTools opens, a banner appears; when it
  closes, the page goes back to normal.
- **Keyboard deterrents** for `F12`, `Ctrl+U`, `Ctrl+Shift+I/J/C/K`,
  `Ctrl+S`, `Ctrl+P`, `Ctrl+A`, `F7`. F9 (Run) and Ctrl/Cmd+Enter still work.

## Quick start

```bash
# Build + run
docker-compose up -d --build

# Open
xdg-open http://localhost:8080
```

## Project layout

```
.
├── backend/
│   ├── package.json
│   └── server.js              # Express API + C++ execution engine
├── public/
│   ├── index.html             # Monaco editor UI (dark theme)
│   ├── app.js                 # Frontend controller
│   ├── guard.js               # Context menu, devtools detection, key blocker
│   └── config.js              # Injected by CI: window.IDE_API_BASE = '…'
├── .github/
│   └── workflows/
│       └── deploy.yml         # Docker build + GH Pages deploy
├── Dockerfile                 # Node 20 + g++ + dumb-init
├── docker-compose.yml
├── CNAME                      # ide.ankb.qzz.io
├── .dockerignore
└── .gitignore
```

## API

### `POST /api/run`

Request:

```json
{ "code": "#include <bits/stdc++.h>\n…", "stdin": "5\n1 2 3 4 5" }
```

Response:

```json
{
  "success": true,
  "stage": "run",
  "stdout": "1 2 3 4 5 ",
  "stderr": "",
  "compile_error": "",
  "exit_code": 0,
  "durationMs": 47,
  "killed": false,
  "signal": null,
  "timed_out": false
}
```

- `stage: "compile"` is returned (with HTTP 200) when g++ fails.
- `timed_out: true` indicates the 2-second wall-clock cap was hit.

### `GET /api/template`

Returns the default C++ template that the editor pre-fills.

### `GET /api/health`

`{ "ok": true, "uptime": …, "version": "1.0.0" }`

## Security notes

- Each request runs in its own `os.tmpdir()/ide-<rand>/` working directory,
  which is `rm -rf`'d when the response ends.
- The compiled binary is invoked as `binary < in.txt` via `/bin/sh -c`,
  with no shell-expanded user input (paths are JSON-escaped literals).
- The Node process runs as root inside the container (for `/tmp` writes);
  do not expose this container directly to the public internet without a
  reverse proxy and proper isolation. The included `docker-compose.yml`
  caps the container at 1 GB RAM and 2 CPUs.
- For multi-tenant production use, run the worker in a separate
  Firecracker / gVisor / Docker-in-Docker sandbox.

## Custom domain

The repository includes a `CNAME` file with `ide.ankb.qzz.io`. Create a
DNS record:

```
ide.ankb.qzz.io.   CNAME   <your-username>.github.io.
```

or use your DNS provider's equivalent ALIAS / ANAME for an apex domain.
The Pages workflow picks up the `CNAME` automatically.

## Anti-DevTools (deterrent layer)

> The anti-DevTools layer in `public/guard.js` is a **deterrent**, not a
> security boundary. Anyone with the URL can view the source of any
> browser-side code. The blocker is meant to discourage casual inspection
> of the front-end and to prevent the average visitor from accidentally
> viewing the source via right-click / Ctrl+U / F12.

The actual server-side sandbox lives in `backend/server.js`: per-request
temp dir, 2s wall-clock cap (SIGKILL), 256 MB RAM cap via `prlimit`, 1 MB
output cap, source code size cap (64 KB), and an IP rate limit
(30 req/min). For multi-tenant production use, run the worker in a
separate Firecracker / gVisor / Docker-in-Docker sandbox.



```bash
# Backend (with g++ installed)
cd backend && npm install && node server.js

# Frontend is served by the backend on http://localhost:8080
```
