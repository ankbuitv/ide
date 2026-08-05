/**
 * Cloudflare Pages Function — API proxy / fallback
 * Serves: /api/health, /api/template, /api/run
 *
 * - If env.BACKEND_URL is set: proxy to that Node.js backend
 * - Else: fallback to Piston public API (https://emkc.org/api/v2/piston)
 *         so C++ still runs without self-hosting backend
 *
 * Deploy:
 * - Build output directory: public
 * - Functions directory: functions (auto-detected)
 * - Optional env var in Cloudflare dashboard: BACKEND_URL=https://your-backend.example.com
 */

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

const PISTON_API = 'https://emkc.org/api/v2/piston/execute';
const VERSION = '1.0.0';

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders,
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname; // /api/health etc

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return corsPreflight();
  }

  const backendUrl = (env.BACKEND_URL || '').replace(/\/+$/, '');
  const mode = backendUrl ? 'proxy' : 'piston';

  try {
    // ---------------- HEALTH ----------------
    if (pathname === '/api/health' || pathname === '/api/health/') {
      if (backendUrl) {
        try {
          const r = await fetch(`${backendUrl}/api/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });
          const text = await r.text();
          let data;
          try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: r.ok, raw: text.slice(0, 500) }; }
          return jsonResponse({
            ok: r.ok,
            mode: 'proxy',
            backend: backendUrl,
            version: data.version || VERSION,
            uptime: data.uptime || null,
            proxied: data,
          }, r.status);
        } catch (e) {
          // proxy failed, fallback to piston healthy
          return jsonResponse({
            ok: true,
            mode: 'piston',
            version: VERSION,
            warning: `backend proxy failed: ${e.message}, fallback to piston`,
          });
        }
      }
      return jsonResponse({
        ok: true,
        mode: 'piston',
        version: VERSION,
        timestamp: new Date().toISOString(),
      });
    }

    // ---------------- TEMPLATE ----------------
    if (pathname === '/api/template' || pathname === '/api/template/') {
      if (backendUrl) {
        try {
          const r = await fetch(`${backendUrl}/api/template`, { headers: { Accept: 'application/json' } });
          const text = await r.text();
          let data;
          try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
          if (r.ok && data && data.code) {
            return jsonResponse({ language: data.language || 'cpp', code: data.code, mode: 'proxy' }, 200);
          }
        } catch (_) {
          // fall through to default
        }
      }
      return jsonResponse({
        language: 'cpp',
        code: DEFAULT_TEMPLATE,
        mode: 'piston',
      });
    }

    // ---------------- RUN ----------------
    if (pathname === '/api/run' || pathname === '/api/run/') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed, use POST' }, 405);
      }

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return jsonResponse({ error: 'Invalid JSON body', detail: e.message }, 400);
      }

      const code = body.code;
      const stdin = typeof body.stdin === 'string' ? body.stdin : '';

      if (typeof code !== 'string' || !code.trim()) {
        return jsonResponse({ error: 'code is required (string)' }, 400);
      }
      if (code.length > 64 * 1024) {
        return jsonResponse({ error: 'code exceeds 64KB' }, 413);
      }
      if (stdin.length > 64 * 1024) {
        return jsonResponse({ error: 'stdin exceeds 64KB' }, 413);
      }

      // If BACKEND_URL set, proxy to Node backend
      if (backendUrl) {
        try {
          const r = await fetch(`${backendUrl}/api/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ code, stdin }),
          });
          const text = await r.text();
          let j;
          try { j = text ? JSON.parse(text) : {}; } catch {
            return jsonResponse({
              success: false,
              stage: 'error',
              stderr: `Backend returned non-JSON (status ${r.status}): ${text.slice(0, 1000)}`,
              compile_error: '',
              stdout: '',
            }, 502);
          }
          // Ensure CORS passthrough
          return jsonResponse({ ...j, mode: 'proxy', backend: backendUrl }, r.status);
        } catch (e) {
          return jsonResponse({
            success: false,
            stage: 'error',
            stderr: `Proxy to backend failed: ${e.message}\nBackend URL: ${backendUrl}\nHint: Check BACKEND_URL env var or deploy without it to use Piston fallback.`,
            compile_error: '',
            stdout: '',
            mode: 'proxy_error',
          }, 502);
        }
      }

      // Fallback: Piston public API
      try {
        const pistonRes = await fetch(PISTON_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: 'c++',
            version: '*',
            files: [{ name: 'main.cpp', content: code }],
            stdin: stdin,
            args: [],
            compile_timeout: 10000,
            run_timeout: 3000,
          }),
        });

        const pistonText = await pistonRes.text();
        let pistonData;
        try {
          pistonData = pistonText ? JSON.parse(pistonText) : {};
        } catch (parseErr) {
          return jsonResponse({
            success: false,
            stage: 'error',
            stderr: `Piston API returned invalid JSON (status ${pistonRes.status}): ${pistonText.slice(0, 1000)}`,
            compile_error: '',
            stdout: '',
            mode: 'piston',
          }, 502);
        }

        if (!pistonRes.ok) {
          return jsonResponse({
            success: false,
            stage: 'error',
            stderr: `Piston API error ${pistonRes.status}: ${JSON.stringify(pistonData).slice(0, 2000)}`,
            compile_error: '',
            stdout: '',
            mode: 'piston',
          }, pistonRes.status);
        }

        // Piston format: { run: {...}, compile: {...}? }
        const compile = pistonData.compile;
        const run = pistonData.run;

        // Compilation failure
        if (compile && compile.code !== 0) {
          return jsonResponse({
            success: false,
            stage: 'compile',
            stdout: compile.stdout || '',
            stderr: compile.stderr || compile.output || '',
            compile_error: compile.stderr || compile.output || compile.stdout || 'Compilation failed',
            exit_code: compile.code,
            durationMs: null,
            signal: compile.signal || null,
            mode: 'piston',
            language: pistonData.language,
            version: pistonData.version,
          });
        }

        // Run result
        if (!run) {
          return jsonResponse({
            success: false,
            stage: 'error',
            stderr: `Piston returned no run result: ${JSON.stringify(pistonData).slice(0, 2000)}`,
            compile_error: '',
            stdout: '',
            mode: 'piston',
          }, 500);
        }

        const success = run.code === 0;
        return jsonResponse({
          success,
          stage: 'run',
          stdout: run.stdout || '',
          stderr: run.stderr || '',
          compile_error: '',
          exit_code: run.code,
          durationMs: null,
          signal: run.signal || null,
          timed_out: run.signal === 'SIGKILL' || false,
          mode: 'piston',
          language: pistonData.language,
          version: pistonData.version,
        });
      } catch (e) {
        return jsonResponse({
          success: false,
          stage: 'error',
          stderr: `Piston fallback failed: ${e && e.message || e}\nTry setting BACKEND_URL env to your own Node backend.`,
          compile_error: '',
          stdout: '',
          mode: 'piston_error',
        }, 502);
      }
    }

    // Unknown /api/* path
    return jsonResponse({ error: `Unknown API path ${pathname}`, available: ['/api/health', '/api/template', '/api/run'] }, 404);
  } catch (err) {
    return jsonResponse({
      error: 'Internal Pages Function error',
      detail: String(err && err.message || err),
      stack: err && err.stack ? err.stack.slice(0, 2000) : undefined,
    }, 500);
  }
}
