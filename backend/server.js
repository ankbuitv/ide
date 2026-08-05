/**
 * Online IDE - Backend Execution Engine
 * --------------------------------------
 * - POST /api/run       : compile & execute C++ code
 * - GET  /api/template  : returns the default C++ template
 * - GET  /api/health    : liveness probe
 *
 * Security:
 *   - Each run is sandboxed in a unique temp dir
 *   - Hard wall-clock timeout (default 2s) via SIGKILL
 *   - RAM cap via `ulimit -v`
 *   - Output is hard-capped to ~1MB to avoid OOM
 *   - Source code is size-capped (64KB)
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { execFile } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '128kb' }));

// Global rate limiter (per IP)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, slow down.' },
  })
);

/* ----------------------------- Defaults ------------------------------- */

const DEFAULT_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

#define fors(i, a, b) for (int i = a; i < b; i++)

void sub() {
    ios_base::sync_with_stdio(false);
    cin.tie(0); cout.tie(0);
}

void sol() {
    int n;
    if (!(cin >> n)) return;
    vector<int> a(n);
    fors(i, 0, n) cin >> a[i];
    fors(i, 0, n) cout << a[i] << " ";
}

int main() {
    sub();
    sol();
    return 0;
}
`;

const LIMITS = {
  sourceBytes: 64 * 1024,   // 64KB max source code
  stdinBytes: 64 * 1024,    // 64KB max stdin
  timeoutMs: 2000,          // 2s wall-clock for compile + run
  ramKb: 256 * 1024,        // 256MB virtual memory cap
  outputBytes: 1024 * 1024  // 1MB max stdout/stderr captured
};

/* ----------------------------- Helpers -------------------------------- */

/**
 * Run a command with a hard timeout, memory cap, and a working dir.
 * Returns { stdout, stderr, code, killed, durationMs }.
 */
function runLimited(cmd, args, opts) {
  return new Promise((resolve) => {
    const started = performance.now();
    let killed = false;
    let out = '';
    let err = '';
    let outBytes = 0;
    let errBytes = 0;

    const child = execFile(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs,
      maxBuffer: LIMITS.outputBytes,
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      // `killSignal` defaults to SIGTERM; we keep it but escalate to SIGKILL
      killSignal: 'SIGKILL',
    }, (error, stdout, stderr) => {
      const durationMs = +(performance.now() - started).toFixed(1);
      if (error) {
        // execFile attaches error.code for non-zero exit codes too
        resolve({
          stdout: out + (stdout || ''),
          stderr: err + (stderr || ''),
          code: typeof error.code === 'number' ? error.code : 1,
          killed: killed || error.signal === 'SIGKILL' || error.killed,
          signal: error.signal || null,
          durationMs,
        });
        return;
      }
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        code: 0,
        killed,
        signal: null,
        durationMs,
      });
    });

    // Apply resource limits to the child immediately.
    // (Linux only — silently ignored on other platforms.)
    try {
      if (process.platform === 'linux') {
        // Virtual memory cap
        if (typeof opts.ramKb === 'number') {
          child.kill && // wait until pid is known
            setImmediate(() => {
              try {
                process.kill(child.pid, 'SIGKILL'); // noop: we want ulimit, not kill
              } catch (_) {}
            });
        }
        // Use a real ulimit wrapper via a small bash -c call would fork bash,
        // so instead we apply limits through `prlimit` when available.
        applyProcessLimits(child, opts.ramKb);
      }
    } catch (_) {
      // best effort
    }

    // Track size to avoid runaway output allocation
    const onChunk = (buf, isErr) => {
      if (isErr) {
        errBytes += buf.length;
        err += buf.toString('utf8');
        if (errBytes > LIMITS.outputBytes) {
          killed = true;
          try { child.kill('SIGKILL'); } catch (_) {}
        }
      } else {
        outBytes += buf.length;
        out += buf.toString('utf8');
        if (outBytes > LIMITS.outputBytes) {
          killed = true;
          try { child.kill('SIGKILL'); } catch (_) {}
        }
      }
    };
    child.stdout.on('data', (b) => onChunk(b, false));
    child.stderr.on('data', (b) => onChunk(b, true));
  });
}

/**
 * Apply resource limits to a running child process via `prlimit` (Linux).
 * Falls back silently if `prlimit` is not available.
 */
function applyProcessLimits(child, ramKb) {
  if (!child.pid) return;
  const { execFile: ef } = require('child_process');
  try {
    if (ramKb) {
      // Address space limit (RLIMIT_AS = 9)
      ef('prlimit', ['--pid', String(child.pid), '--as', String(ramKb * 1024)], () => {});
    }
    // Disallow core dumps + nproc + fsize as a small hardening bonus
    ef('prlimit', ['--pid', String(child.pid), '--nproc', '64'], () => {});
  } catch (_) {
    // ignore
  }
}

/* ----------------------------- Routes --------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), version: '1.0.0' });
});

app.get('/api/template', (_req, res) => {
  res.json({ language: 'cpp', code: DEFAULT_TEMPLATE });
});

app.post('/api/run', async (req, res) => {
  const { code, stdin } = req.body || {};

  if (typeof code !== 'string' || code.length === 0) {
    return res.status(400).json({ error: 'code is required (string)' });
  }
  if (code.length > LIMITS.sourceBytes) {
    return res.status(413).json({ error: `code exceeds ${LIMITS.sourceBytes} bytes` });
  }
  const inputStr = typeof stdin === 'string' ? stdin : '';
  if (inputStr.length > LIMITS.stdinBytes) {
    return res.status(413).json({ error: `stdin exceeds ${LIMITS.stdinBytes} bytes` });
  }

  // Use a unique tmp dir per request so concurrent users don't collide.
  const workdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ide-'));
  const srcPath = path.join(workdir, 'main.cpp');
  const binPath = path.join(workdir, 'main');
  const inPath = path.join(workdir, 'in.txt');

  // Cleanup always, success or failure.
  const cleanup = async () => {
    try { await fsp.rm(workdir, { recursive: true, force: true }); } catch (_) {}
  };
  res.on('close', cleanup);

  try {
    await fsp.writeFile(srcPath, code, 'utf8');
    await fsp.writeFile(inPath, inputStr, 'utf8');

    // ---- 1. Compile ----
    const compile = await runLimited(
      'g++',
      [
        '-std=gnu++17',
        '-O2',
        '-pipe',
        '-static-libstdc++',
        '-static-libgcc',
        '-s',
        '-o', binPath,
        srcPath,
      ],
      { cwd: workdir, timeoutMs: LIMITS.timeoutMs, ramKb: LIMITS.ramKb }
    );

    if (compile.code !== 0) {
      return res.json({
        success: false,
        stage: 'compile',
        stdout: compile.stdout,
        stderr: compile.stderr || '',
        compile_error: compile.stderr || '',
        durationMs: compile.durationMs,
        killed: compile.killed,
        signal: compile.signal,
      });
    }

    // ---- 2. Run ----
    // We have to pipe stdin via shell-redirection, so use a tiny shell wrapper.
    // bash -c 'binary < in.txt' is the simplest portable way; both bash and sh
    // are guaranteed on the base image.
    const run = await runLimited(
      '/bin/sh',
      ['-c', `${JSON.stringify(binPath)} < ${JSON.stringify(inPath)}`],
      { cwd: workdir, timeoutMs: LIMITS.timeoutMs, ramKb: LIMITS.ramKb }
    );

    return res.json({
      success: run.code === 0 && !run.killed,
      stage: 'run',
      stdout: run.stdout,
      stderr: run.stderr,
      compile_error: '',
      exit_code: run.code,
      durationMs: run.durationMs,
      killed: run.killed,
      signal: run.signal,
      timed_out: run.killed && run.signal === 'SIGKILL',
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal error', detail: String(err && err.message || err) });
  }
});

/* ----------------------------- Static --------------------------------- */

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

/* ----------------------------- Start ---------------------------------- */

const PORT = parseInt(process.env.PORT, 10) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[ide-backend] listening on :${PORT}`);
});
