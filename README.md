# Online IDE — C++

A fast, dark, VS Code–style online IDE for C++, with a Node.js execution
engine that compiles and runs user code in an isolated, time-and-RAM-capped
child process. One Docker container, one command to run. Now deployable on
Cloudflare Pages for free in 1 minute.

![tech](https://img.shields.io/badge/Node.js-20-3fb950?logo=node.js&logoColor=white)
![tech](https://img.shields.io/badge/g++-14-00599C?logo=c%2B%2B&logoColor=white)
![tech](https://img.shields.io/badge/Monaco-0.45-0078d4?logo=visualstudiocode&logoColor=white)
![tech](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![deploy](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)

## 🚀 Deployment Options (3 ways)

### 1. Cloudflare Pages — Recommended (Free, 1-min setup)

Best for public demo, no backend hosting needed. Uses included `functions/api/[[path]].js` which automatically falls back to Piston public API.

**Steps:**

1. Go to Cloudflare Dashboard → **Pages** → **Create application** → **Connect to Git**
2. Select repo `ankbuitv/ide`
3. Framework preset: **None**
4. Build command: *(leave empty)*
5. Build output directory: `public`
6. Environment variables (optional):
   - `BACKEND_URL` = `https://your-backend.example.com` → if you want proxy to your own Node backend
   - Leave empty to use Piston public API (https://emkc.org) — works out of the box
7. **Save and Deploy** → IDE live at `https://<project>.pages.dev`

**Files required for Pages:**

- `public/_headers` — security headers + CORS
- `public/_redirects` — keeps /api/* on Functions (200), SPA fallback
- `wrangler.toml` — `pages_build_output_dir = "public"`
- `functions/api/[[path]].js` — serves 3 endpoints:
  - `GET /api/health` → `{ok, mode:'proxy'|'piston'}`
  - `GET /api/template` → default C++ template
  - `POST /api/run` → proxy to BACKEND_URL or Piston

**Fixes for Pages:**

- Renamed `public/guard.js` → `public/security.js` (guard keyword is blocked by ERR_BLOCKED_BY_CLIENT on some edge networks / Cloudflare)
- `security.js` now only uses size heuristic (`outerWidth-innerWidth`) wrapped in try/catch, removed `console.log('%c', new Image())` and `debugger;` tricks that spam console in Workers
- Frontend `app.js` now uses `text() + JSON.parse()` with graceful error UI instead of crashing on `Unexpected end of JSON input` when API returns 404 HTML

### 2. Piston Public API — No Backend (default)

If `BACKEND_URL` is NOT set, the Pages Function automatically uses Piston:

```js
POST https://emkc.org/api/v2/piston/execute
{
  language: "c++",
  version: "*",
  files: [{ name: "main.cpp", content: code }],
  stdin: "5\n1 2 3"
}
```

Mapped to our format `{success, stage, stdout, stderr, compile_error}`.
- Free, no API key
- ~3s timeout, limited RAM, but enough for demo
- Rate-limited, don't abuse

This is what runs when you deploy only `public/` to Pages without a backend.

### 3. Docker Backend — Self-Hosted (Full control)

Full Node.js + g++ sandbox, 2s timeout, 256MB RAM, 1MB output cap.

```bash
# Build + run
docker-compose up -d --build

# Open
xdg-open http://localhost:8080
```

Or manually:

```bash
cd backend && npm install && node server.js
# Frontend served at http://localhost:8080
```

Then if you also want Cloudflare frontend to proxy to it, set env in Pages:

```
BACKEND_URL=https://your-backend.fly.dev
```

The Function will then proxy `/api/*` to your backend.

---

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
- **DevTools-detection warning banner** (size heuristic only, refreshed every
  800 ms). When DevTools opens, a banner appears; when it closes, the page
  goes back to normal.
- **Keyboard deterrents** for `F12`, `Ctrl+U`, `Ctrl+Shift+I/J/C/K`,
  `Ctrl+S`, `Ctrl+P`, `Ctrl+A`, `F7`. F9 (Run) and Ctrl/Cmd+Enter still work.

## Project layout

```
.
├── backend/
│   ├── package.json
│   └── server.js              # Express API + C++ execution engine
├── functions/
│   └── api/
│       └── [[path]].js        # Cloudflare Pages Function (proxy + Piston fallback)
├── public/
│   ├── index.html             # Monaco editor UI (dark theme)
│   ├── app.js                 # Frontend controller (graceful JSON parse)
│   ├── security.js            # Context menu, devtools detection (renamed from guard.js)
│   ├── config.js              # Injected by CI: window.IDE_API_BASE = '…'
│   ├── _headers               # Cloudflare Pages headers
│   └── _redirects             # Cloudflare Pages redirects
├── wrangler.toml              # Cloudflare Pages config (output_dir = public)
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
  "timed_out": false,
  "mode": "piston"
}
```

- `stage: "compile"` is returned (with HTTP 200) when g++ fails.
- `timed_out: true` indicates the 2-second wall-clock cap was hit.
- `mode: "piston" | "proxy"` tells you which engine handled it.

### `GET /api/template`

Returns the default C++ template that the editor pre-fills.

### `GET /api/health`

`{ "ok": true, "mode": "piston", "version": "1.0.0" }` or `{ "ok": true, "mode": "proxy", "backend": "..." }`

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

> The anti-DevTools layer in `public/security.js` (renamed from guard.js) is a **deterrent**, not a
> security boundary. Anyone with the URL can view the source of any
> browser-side code. The blocker is meant to discourage casual inspection
> of the front-end and to prevent the average visitor from accidentally
> viewing the source via right-click / Ctrl+U / F12.

For Cloudflare stability:
- Only window size heuristic (`outerWidth - innerWidth`) — no `console.log('%c', Image)` or `debugger;`
- Wrapped in try/catch to avoid spam in Workers env
- Renamed to avoid `ERR_BLOCKED_BY_CLIENT` filters that block `guard.js`

The actual server-side sandbox lives in `backend/server.js`: per-request
temp dir, 2s wall-clock cap (SIGKILL), 256 MB RAM cap via `prlimit`, 1 MB
output cap, source code size cap (64 KB), and an IP rate limit
(30 req/min). For multi-tenant production use, run the worker in a
separate Firecracker / gVisor / Docker-in-Docker sandbox.
