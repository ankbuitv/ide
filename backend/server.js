/**
 * ide.ankb - Backend Execution Engine (v9.5)
 * - Compile & run C++ with g++, fallback to Judge0 CE / Judge0 when overloaded
 * - Fixes OCI runtime error: crun: clone: Resource temporarily unavailable (nproc 64->512, RAM 1GB, pids_limit 2048)
 * - Judge0 CE default fallback (env JUDGE0_API_URL)
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { execFile } = require('child_process');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '128kb' }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, slow down.' },
  })
);

const DEFAULT_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;

#define fors(i, a, b) for (int i = a; i < b; i++)

#define ll long long

void sub() {
    ios_base::sync_with_stdio(false);
    cin.tie(0); cout.tie(0);
}

void sol() {
   cout << "Hello world!";
}

int main() {
    sub();
    sol();
    return 0;
}
`;

const LIMITS = {
  sourceBytes: 64 * 1024,
  stdinBytes: 64 * 1024,
  timeoutMs: 2000,
  compileTimeoutMs: 10000,
  runTimeoutMs: 2000,
  ramKb: 512 * 1024,
  compileRamKb: 1024 * 1024,
  runRamKb: 512 * 1024,
  outputBytes: 1024 * 1024,
  maxConcurrent: 6,
};

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
      killSignal: 'SIGKILL',
    }, (error, stdout, stderr) => {
      const durationMs = +(performance.now() - started).toFixed(1);
      if (error) {
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
      resolve({ stdout: stdout || '', stderr: stderr || '', code: 0, killed, signal: null, durationMs });
    });

    try {
      if (process.platform === 'linux') {
        applyProcessLimits(child, opts.ramKb);
      }
    } catch (_) {}

    const onChunk = (buf, isErr) => {
      if (isErr) {
        errBytes += buf.length; err += buf.toString('utf8');
        if (errBytes > LIMITS.outputBytes) { killed = true; try { child.kill('SIGKILL'); } catch (_) {} }
      } else {
        outBytes += buf.length; out += buf.toString('utf8');
        if (outBytes > LIMITS.outputBytes) { killed = true; try { child.kill('SIGKILL'); } catch (_) {} }
      }
    };
    child.stdout.on('data', (b) => onChunk(b, false));
    child.stderr.on('data', (b) => onChunk(b, true));
  });
}

function applyProcessLimits(child, ramKb) {
  if (!child.pid) return;
  const { execFile: ef } = require('child_process');
  try {
    if (ramKb) ef('prlimit', ['--pid', String(child.pid), '--as', String(ramKb * 1024)], () => {});
    ef('prlimit', ['--pid', String(child.pid), '--nproc', '512'], () => {});
    ef('prlimit', ['--pid', String(child.pid), '--fsize', '100000000'], () => {});
  } catch (_) {}
}

async function tryJudge0(code, stdin) {
  const judge0Url = (process.env.JUDGE0_API_URL || process.env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/+$/, '');
  if (!judge0Url) return { skipped: true };
  // If using default public ce.judge0.com without key, try without auth — may fail but we try
  const languageId = parseInt(process.env.JUDGE0_LANGUAGE_ID || '54', 10);
  const apiKey = process.env.JUDGE0_API_KEY || '';
  const apiHost = process.env.JUDGE0_API_HOST || '';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) { headers['X-RapidAPI-Key'] = apiKey; if (apiHost) headers['X-RapidAPI-Host'] = apiHost; }
  const url = `${judge0Url}/submissions?base64_encoded=true&wait=true`;
  try {
    // Encode code and stdin to base64
    const codeB64 = Buffer.from(code, 'utf8').toString('base64');
    const stdinB64 = Buffer.from(stdin || '', 'utf8').toString('base64');
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ source_code: codeB64, language_id: languageId, stdin: stdinB64 }) });
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) return { error: `Judge0 ${res.status}: ${text.slice(0,500)}`, status: res.status };
    if (!data) return { error: `Judge0 invalid JSON: ${text.slice(0,500)}` };
    // Decode base64 responses
    const stdout = data.stdout ? Buffer.from(data.stdout, 'base64').toString('utf8') : '';
    const stderr = data.stderr ? Buffer.from(data.stderr, 'base64').toString('utf8') : '';
    const compileOutput = data.compile_output ? Buffer.from(data.compile_output, 'base64').toString('utf8') : '';
    const statusId = data.status?.id;
    if (statusId === 6 || (compileOutput && compileOutput.trim())) {
      return { success: false, stage: 'compile', stdout, stderr, compile_error: compileOutput || stderr || 'Compilation failed', exit_code: statusId, mode: 'judge0', judge0Status: data.status?.description, time: data.time, memory: data.memory };
    }
    const isSuccess = statusId === 3;
    return { success: isSuccess, stage: 'run', stdout, stderr, compile_error: '', exit_code: isSuccess ? 0 : (statusId || 1), timed_out: statusId === 5, mode: 'judge0', judge0Status: data.status?.description, time: data.time, memory: data.memory };
  } catch (e) { return { error: `Judge0 exception: ${e.message}` }; }
}

async function tryJudge0(code, stdin) {
  // Removed in app branch - Judge0 only (per user request: bỏ judge0 đi)
  return { error: 'Judge0 removed in app branch - use Judge0 only', skipped: true };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), version: '1.0.0', mode: process.env.JUDGE0_API_URL ? 'judge0' : 'native', backend: 'ide.ankb' });
});

app.get('/api/template', (_req, res) => {
  res.json({ language: 'cpp', code: DEFAULT_TEMPLATE });
});

app.post('/api/run', async (req, res) => {
  const { code, stdin, version, cppVersion } = req.body || {};
  if (typeof code !== 'string' || code.length === 0) return res.status(400).json({ error: 'code is required' });
  if (code.length > LIMITS.sourceBytes) return res.status(413).json({ error: `code exceeds ${LIMITS.sourceBytes} bytes` });
  const inputStr = typeof stdin === 'string' ? stdin : '';
  if (inputStr.length > LIMITS.stdinBytes) return res.status(413).json({ error: `stdin exceeds ${LIMITS.stdinBytes} bytes` });

  const stdVersion = version || cppVersion || '17';
  const stdFlag = CPP_STD_MAP[stdVersion] || CPP_STD_MAP['17'];

  const workdir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ide-'));
  const srcPath = path.join(workdir, 'main.cpp');
  const binPath = path.join(workdir, 'main');
  const inPath = path.join(workdir, 'in.txt');

  const cleanup = async () => { try { await fsp.rm(workdir, { recursive: true, force: true }); } catch (_) {} };
  res.on('close', cleanup);

  if (global.__activeJobs === undefined) global.__activeJobs = 0;
  if (global.__activeJobs >= LIMITS.maxConcurrent) {
    // Try Judge0 fallback when busy
    console.log(`[ide.ankb] too many concurrent jobs ${global.__activeJobs}/${LIMITS.maxConcurrent}, trying Judge0 fallback`);
    const judge0Result = await tryJudge0(code, inputStr);
    if (!judge0Result.error && !judge0Result.skipped) {
      return res.json({ ...judge0Result, durationMs: 0, fallback: 'judge0-busy' });
    }
    return res.status(503).json({ error: 'Server busy', detail: `Active ${global.__activeJobs}/${LIMITS.maxConcurrent}`, retryAfter: 1, stage: 'error', mode: 'busy' });
  }
  global.__activeJobs++;

  try {
    await fsp.writeFile(srcPath, code, 'utf8');
    await fsp.writeFile(inPath, inputStr, 'utf8');

    const compile = await runLimited('g++', [stdFlag, '-O2', '-pipe', '-static-libstdc++', '-static-libgcc', '-s', '-o', binPath, srcPath], { cwd: workdir, timeoutMs: LIMITS.compileTimeoutMs, ramKb: LIMITS.compileRamKb });

    const combinedErr = (compile.stderr || '') + (compile.stdout || '');
    if (/OCI runtime error|crun: clone|Resource temporarily unavailable|fork: retry|Cannot allocate memory/i.test(combinedErr)) {
      console.log(`[ide.ankb] OCI crun error detected, trying Judge0/Judge0 fallback`);
      const judge0Result = await tryJudge0(code, inputStr);
      if (!judge0Result.error && !judge0Result.skipped) {
        return res.json({ ...judge0Result, durationMs: compile.durationMs, fallback: 'judge0-oci', originalError: combinedErr.slice(0,500) });
      }
      return res.status(503).json({
        success: false, stage: 'error', stdout: '', stderr: `Transient container resource error: ${combinedErr.slice(0,2000)}\n\nFixes: nproc 512, RAM 1GB, pids_limit 2048, concurrency 6\nFallback attempted: Judge0 ${judge0Result.error||'skipped'}, Judge0 ${judge0Result.error}\n\nPlease retry, docker-compose down && up -d --build, or set JUDGE0_API_URL`, compile_error: '', durationMs: compile.durationMs, retryable: true, mode: 'oci-error',
      });
    }

    if (compile.code !== 0) {
      return res.json({ success: false, stage: 'compile', stdout: compile.stdout, stderr: compile.stderr || '', compile_error: compile.stderr || '', durationMs: compile.durationMs, killed: compile.killed, signal: compile.signal, mode: 'native' });
    }

    const run = await runLimited('/bin/sh', ['-c', `${JSON.stringify(binPath)} < ${JSON.stringify(inPath)}`], { cwd: workdir, timeoutMs: LIMITS.runTimeoutMs, ramKb: LIMITS.runRamKb });

    return res.json({ success: run.code === 0 && !run.killed, stage: 'run', stdout: run.stdout, stderr: run.stderr, compile_error: '', exit_code: run.code, durationMs: run.durationMs, killed: run.killed, signal: run.signal, timed_out: run.killed && run.signal === 'SIGKILL', mode: 'native', cppVersion: stdVersion, stdFlag });
  } catch (err) {
    return res.status(500).json({ error: 'internal error', detail: String(err && err.message || err) });
  } finally {
    global.__activeJobs = Math.max(0, (global.__activeJobs || 1) - 1);
    try { await fsp.rm(workdir, { recursive: true, force: true }); } catch (_) {}
  }
});

const CPP_STD_MAP = {
  '11': '-std=c++11',
  '14': '-std=c++14',
  '17': '-std=gnu++17',
  '20': '-std=c++20',
  '23': '-std=c++23',
};

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const PORT = parseInt(process.env.PORT, 10) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ide.ankb] listening on :${PORT} mode=${process.env.JUDGE0_API_URL?'judge0':'native'} version=C++17/20/23`);
});
