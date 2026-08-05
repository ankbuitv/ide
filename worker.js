/**
 * Cloudflare Worker entry for Online IDE
 * Serves both static assets (via ASSETS binding) and /api/* via Piston or proxy
 * This makes `npx wrangler deploy` work when project is configured as Workers, not Pages
 * For Pages deployment, functions/api/[[path]].js is used instead (auto-detected)
 */

const DEFAULT_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;
#define ll long long
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
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

    const backendUrl = (env.BACKEND_URL || '').replace(/\/+$/, '');
    const mode = backendUrl ? 'proxy' : 'piston';

    // API routes
    if (pathname.startsWith('/api/')) {
      try {
        if (pathname === '/api/health' || pathname === '/api/health/') {
          if (backendUrl) {
            try {
              const r = await fetch(`${backendUrl}/api/health`, { headers: { Accept: 'application/json' } });
              const text = await r.text();
              let data;
              try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
              return jsonResponse({ ok: r.ok, mode: 'proxy', backend: backendUrl, version: data.version || VERSION, proxied: data }, r.status);
            } catch (e) {
              return jsonResponse({ ok: true, mode: 'piston', version: VERSION, warning: `backend proxy failed: ${e.message}` });
            }
          }
          return jsonResponse({ ok: true, mode: 'piston', version: VERSION, timestamp: new Date().toISOString() });
        }

        if (pathname === '/api/template' || pathname === '/api/template/') {
          if (backendUrl) {
            try {
              const r = await fetch(`${backendUrl}/api/template`, { headers: { Accept: 'application/json' } });
              const text = await r.text();
              let data;
              try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
              if (r.ok && data && data.code) {
                return jsonResponse({ language: data.language || 'cpp', code: data.code, mode: 'proxy' });
              }
            } catch (_) {}
          }
          return jsonResponse({ language: 'cpp', code: DEFAULT_TEMPLATE, mode: 'piston' });
        }

        if (pathname === '/api/run' || pathname === '/api/run/') {
          if (request.method !== 'POST') {
            return jsonResponse({ error: 'Method not allowed' }, 405);
          }
          let body;
          try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON', detail: e.message }, 400); }
          const code = body.code;
          const stdin = typeof body.stdin === 'string' ? body.stdin : '';
          if (typeof code !== 'string' || !code.trim()) return jsonResponse({ error: 'code required' }, 400);
          if (code.length > 64 * 1024) return jsonResponse({ error: 'code >64KB' }, 413);

          if (backendUrl) {
            try {
              const r = await fetch(`${backendUrl}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, stdin }) });
              const text = await r.text();
              let j;
              try { j = text ? JSON.parse(text) : {}; } catch { return jsonResponse({ success: false, stage: 'error', stderr: `Backend non-JSON ${r.status}: ${text.slice(0,1000)}`, stdout: '' }, 502); }
              return jsonResponse({ ...j, mode: 'proxy', backend: backendUrl }, r.status);
            } catch (e) {
              return jsonResponse({ success: false, stage: 'error', stderr: `Proxy failed ${e.message}`, stdout: '' }, 502);
            }
          }

          // Piston fallback
          try {
            const pr = await fetch(PISTON_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'c++', version: '*', files: [{ name: 'main.cpp', content: code }], stdin, compile_timeout: 10000, run_timeout: 3000 }) });
            const pt = await pr.text();
            let pd;
            try { pd = pt ? JSON.parse(pt) : {}; } catch { return jsonResponse({ success: false, stage: 'error', stderr: `Piston invalid JSON ${pr.status}: ${pt.slice(0,1000)}`, stdout: '' }, 502); }
            if (!pr.ok) return jsonResponse({ success: false, stage: 'error', stderr: `Piston ${pr.status}: ${JSON.stringify(pd).slice(0,2000)}`, stdout: '' }, pr.status);
            const compile = pd.compile;
            const run = pd.run;
            if (compile && compile.code !== 0) {
              return jsonResponse({ success: false, stage: 'compile', stdout: compile.stdout || '', stderr: compile.stderr || compile.output || '', compile_error: compile.stderr || compile.output || '', exit_code: compile.code, mode: 'piston', language: pd.language, version: pd.version });
            }
            if (!run) return jsonResponse({ success: false, stage: 'error', stderr: `No run result ${JSON.stringify(pd).slice(0,2000)}`, stdout: '' }, 500);
            return jsonResponse({ success: run.code === 0, stage: 'run', stdout: run.stdout || '', stderr: run.stderr || '', compile_error: '', exit_code: run.code, signal: run.signal || null, timed_out: run.signal === 'SIGKILL', mode: 'piston', language: pd.language, version: pd.version });
          } catch (e) {
            return jsonResponse({ success: false, stage: 'error', stderr: `Piston failed ${e.message}`, stdout: '' }, 502);
          }
        }

        return jsonResponse({ error: `Unknown API ${pathname}`, available: ['/api/health','/api/template','/api/run'] }, 404);
      } catch (err) {
        return jsonResponse({ error: 'Worker error', detail: String(err.message || err), stack: err.stack?.slice(0,2000) }, 500);
      }
    }

    // For non-API, try to serve static assets if ASSETS binding exists (Workers with assets)
    try {
      if (env.ASSETS) {
        // env.ASSETS.fetch is the way to get static asset in Workers with assets binding
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) return assetRes;
      }
    } catch (_) {
      // fall through to fetch passthrough
    }

    // Fallback: fetch from origin (for Pages, this will serve public/ files)
    // In Workers without ASSETS, this will just return 404, but we return index.html for SPA
    try {
      const res = await fetch(request);
      if (res.status !== 404) return res;
    } catch (_) {}

    // Final fallback: try to return index.html if exists in cache (for SPA)
    // Note: In Pages deployment, static serving is handled before Worker, so this rarely hits
    return new Response('Not found. Deploy as Pages with output directory = public, or configure [assets] in wrangler.toml', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  },
};
