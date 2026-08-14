/**
 * ide.ankb — Cloudflare Worker (branch app — desktop .exe)
 * Only Judge0 CE + Backend proxy, no Wandbox/Piston
 * C++ versions descending: 23,20,17,14,11
 */

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

const VERSION = '1.0.0';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RapidAPI-Key, X-RapidAPI-Host', 'Cache-Control': 'no-store' },
  });
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function fromBase64(b64) {
  if (!b64) return '';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function tryJudge0(code, stdin, env) {
  const judge0Url = (env.JUDGE0_API_URL || env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/+$/, '');
  if (!judge0Url) return { skipped: true };
  const languageId = parseInt(env.JUDGE0_LANGUAGE_ID || '54', 10);
  const apiKey = env.JUDGE0_API_KEY || '';
  const apiHost = env.JUDGE0_API_HOST || '';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) { headers['X-RapidAPI-Key'] = apiKey; if (apiHost) headers['X-RapidAPI-Host'] = apiHost; }
  const url = `${judge0Url}/submissions?base64_encoded=true&wait=true`;
  try {
    const codeB64 = toBase64(code);
    const stdinB64 = toBase64(stdin || '');
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ source_code: codeB64, language_id: languageId, stdin: stdinB64 }) });
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) return { error: `Judge0 ${res.status}: ${text.slice(0,500)}`, status: res.status };
    if (!data) return { error: `Judge0 invalid JSON: ${text.slice(0,500)}` };
    const stdout = fromBase64(data.stdout); const stderr = fromBase64(data.stderr); const compileOutput = fromBase64(data.compile_output);
    const statusId = data.status?.id;
    if (statusId === 6 || (compileOutput && compileOutput.trim())) {
      return { success: false, stage: 'compile', stdout, stderr, compile_error: compileOutput || stderr || 'Compilation failed', exit_code: statusId, mode: 'judge0', judge0Status: data.status?.description, time: data.time, memory: data.memory };
    }
    const isSuccess = statusId === 3;
    return { success: isSuccess, stage: 'run', stdout, stderr, compile_error: '', exit_code: isSuccess ? 0 : (statusId || 1), timed_out: statusId === 5, mode: 'judge0', judge0Status: data.status?.description, time: data.time, memory: data.memory };
  } catch (e) { return { error: `Judge0 exception: ${e.message}` }; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RapidAPI-Key, X-RapidAPI-Host', 'Access-Control-Max-Age': '86400' } });
    }
    const backendUrl = (env.BACKEND_URL || '').replace(/\/+$/, '');
    const judge0Url = (env.JUDGE0_API_URL || 'https://ce.judge0.com').replace(/\/+$/, '');

    if (pathname.startsWith('/api/')) {
      try {
        if (pathname === '/api/health' || pathname === '/api/health/') {
          if (backendUrl) {
            try { const r = await fetch(`${backendUrl}/api/health`, { headers: { Accept: 'application/json' } }); const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { ok: r.ok }; } return jsonResponse({ ok: r.ok, mode: 'proxy', backend: backendUrl, version: data.version || VERSION }, r.status); } catch (e) { return jsonResponse({ ok: true, mode: 'judge0', version: VERSION, warning: `backend proxy failed ${e.message}` }); }
          }
          return jsonResponse({ ok: true, mode: 'judge0', version: VERSION, timestamp: new Date().toISOString(), backend: 'ide.ankb Judge0 CE', judge0: judge0Url });
        }
        if (pathname === '/api/template' || pathname === '/api/template/') {
          if (backendUrl) {
            try { const r = await fetch(`${backendUrl}/api/template`, { headers: { Accept: 'application/json' } }); const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = null; } if (r.ok && data && data.code) return jsonResponse({ language: data.language || 'cpp', code: data.code, mode: 'proxy' }); } catch (_) {}
          }
          return jsonResponse({ language: 'cpp', code: DEFAULT_TEMPLATE, mode: 'judge0' });
        }
        if (pathname === '/api/run' || pathname === '/api/run/') {
          if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed, use POST' }, 405);
          let body; try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid JSON', detail: e.message }, 400); }
          const code = body.code; const stdin = typeof body.stdin === 'string' ? body.stdin : '';
          if (typeof code !== 'string' || !code.trim()) return jsonResponse({ error: 'code required' }, 400);
          if (backendUrl) {
            try {
              const r = await fetch(`${backendUrl}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, stdin, version: body.version || '23' }) });
              const text = await r.text(); let j; try { j = JSON.parse(text); } catch { return jsonResponse({ success: false, stage: 'error', stderr: `Backend non-JSON ${r.status}: ${text.slice(0,1000)}`, stdout: '' }, 502); }
              if (r.status === 503 || j.retryable || /crun|OCI runtime|Resource temporarily unavailable/i.test(j.stderr || '')) { console.log(`Backend 503, fallback Judge0`); } else { return jsonResponse({ ...j, mode: 'proxy', backend: backendUrl }, r.status); }
            } catch (e) { console.log(`Backend proxy fail ${e.message}, trying Judge0`); }
          }
          const judge0Result = await tryJudge0(code, stdin, env);
          if (!judge0Result.error && !judge0Result.skipped) return jsonResponse(judge0Result, judge0Result.success ? 200 : (judge0Result.stage === 'compile' ? 200 : 500));
          return jsonResponse({ success: false, stage: 'error', stderr: `Tất cả backend đều không khả dụng.\n\nJudge0: ${judge0Result.error?.slice(0,500)}\n\nVui lòng thử lại sau hoặc liên hệ admin.`, stdout: '', mode: 'all_failed' }, 502);
        }
        return jsonResponse({ error: `Unknown API ${pathname}` }, 404);
      } catch (err) { return jsonResponse({ error: 'Worker error', detail: String(err.message || err) }, 500); }
    }
    try { if (env.ASSETS) { const assetRes = await env.ASSETS.fetch(request); if (assetRes.status !== 404) return assetRes; } } catch (_) {}
    try { const res = await fetch(request); if (res.status !== 404) return res; } catch (_) {}
    return new Response('Not found. Deploy as Pages with output public', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  },
};
