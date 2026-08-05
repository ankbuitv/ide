/**
 * Cloudflare Worker — ide.ankb API with Judge0 CE + Piston + Wandbox fallback chain
 * - Piston public 401 whitelist since 2026-02-15
 * - Wandbox may 429 / Resource temporarily unavailable under load
 * - Judge0 CE recommended self-hosted fallback
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

const PISTON_API = 'https://emkc.org/api/v2/piston/execute';
const WANDBOX_API = 'https://wandbox.org/api/compile.json';
const VERSION = '1.0.0';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RapidAPI-Key, X-RapidAPI-Host', 'Cache-Control': 'no-store' },
  });
}

async function tryJudge0(code, stdin, env) {
  const judge0Url = (env.JUDGE0_API_URL || env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/+$/, '');
  if (!judge0Url) return { skipped: true };
  const languageId = parseInt(env.JUDGE0_LANGUAGE_ID || '54', 10);
  const apiKey = env.JUDGE0_API_KEY || '';
  const apiHost = env.JUDGE0_API_HOST || '';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-RapidAPI-Key'] = apiKey;
    if (apiHost) headers['X-RapidAPI-Host'] = apiHost;
  }
  const url = `${judge0Url}/submissions?base64_encoded=false&wait=true`;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ source_code: code, language_id: languageId, stdin: stdin||'', redirect_stderr_to_stdout: false }) });
    const text = await res.text(); let data; try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
    if (!res.ok) return { error: `Judge0 ${res.status}: ${text.slice(0,2000)}`, status: res.status, data };
    if (!data) return { error: `Judge0 invalid JSON: ${text.slice(0,1000)}`, status: 502 };
    const stdout = data.stdout||''; const stderr = data.stderr||''; const compileOutput = data.compile_output||'';
    const statusId = data.status?.id; const statusDesc = data.status?.description||'';
    if (statusId===6 || (compileOutput && compileOutput.trim())) {
      return { success: false, stage: 'compile', stdout, stderr, compile_error: compileOutput||stderr||'Compilation failed', exit_code: statusId, mode: 'judge0', judge0Status: statusDesc, time: data.time, memory: data.memory };
    }
    const isSuccess = statusId===3;
    const isTLE = statusId===5;
    return { success: isSuccess, stage: 'run', stdout, stderr, compile_error: '', exit_code: isSuccess?0:(statusId||1), timed_out: isTLE, mode: 'judge0', judge0Status: statusDesc, time: data.time, memory: data.memory };
  } catch (e) { return { error: `Judge0 exception: ${e.message}`, exception: true }; }
}

async function tryWandbox(code, stdin) {
  const compilers = ['gcc-head', 'gcc-14.2.0', 'gcc-13.2.0', 'gcc-12.2.0', 'gcc-12.1.0'];
  let lastError = null;
  for (const compiler of compilers) {
    try {
      const res = await fetch(WANDBOX_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compiler, code, stdin: stdin||'', 'compiler-option-raw': '-std=gnu++17 -O2 -pipe', save: false }) });
      const text = await res.text(); let data; try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
      if (!res.ok) { lastError = `Wandbox ${compiler} HTTP ${res.status}: ${text.slice(0,1000)}`; if (res.status===400||res.status===404||res.status===429||res.status===503) continue; return { error: lastError, status: res.status }; }
      if (!data) { lastError = `Wandbox ${compiler} invalid JSON`; continue; }
      const hasCompilerError = data.compiler_error && data.compiler_error.trim();
      if (hasCompilerError || (data.status && data.status!=='0' && (data.compiler_error||data.compiler_message))) {
        const err = data.compiler_error||data.compiler_message||data.compiler_output||'Compilation failed';
        if (/not found|unknown compiler/i.test(err)) { lastError=err; continue; }
        return { success: false, stage: 'compile', stdout: data.program_output||'', stderr: data.program_error||'', compile_error: err, exit_code: parseInt(data.status||'1',10), mode: 'wandbox', compiler, url: data.url };
      }
      const exitCode = data.status ? parseInt(data.status,10) : 0;
      return { success: exitCode===0, stage: 'run', stdout: data.program_output||'', stderr: data.program_error||'', compile_error: '', exit_code: exitCode, signal: data.signal||null, mode: 'wandbox', compiler, url: data.url };
    } catch (e) { lastError = `Wandbox ${compiler} exception: ${e.message}`; continue; }
  }
  return { error: lastError || 'All Wandbox compilers failed', stage: 'error' };
}

async function tryPiston(code, stdin, pistonUrl) {
  const url = pistonUrl || PISTON_API;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'c++', version: '*', files: [{ name: 'main.cpp', content: code }], stdin, compile_timeout: 10000, run_timeout: 3000 }) });
    const text = await res.text(); let data; try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
    if (!res.ok) { const isWhitelist = res.status===401 || /whitelist only/i.test(text); return { error: `Piston ${res.status}: ${text.slice(0,2000)}`, status: res.status, isWhitelist, raw: text }; }
    if (!data) return { error: `Piston invalid JSON: ${text.slice(0,1000)}`, status: 502 };
    const compile = data.compile; const run = data.run;
    if (compile && compile.code!==0) return { success: false, stage: 'compile', stdout: compile.stdout||'', stderr: compile.stderr||compile.output||'', compile_error: compile.stderr||compile.output||'', exit_code: compile.code, mode: 'piston', language: data.language, version: data.version };
    if (run) return { success: run.code===0, stage: 'run', stdout: run.stdout||'', stderr: run.stderr||'', compile_error: '', exit_code: run.code, signal: run.signal||null, timed_out: run.signal==='SIGKILL', mode: 'piston', language: data.language, version: data.version };
    return { error: `Piston no run result: ${text.slice(0,2000)}`, status: 500 };
  } catch (e) { return { error: `Piston exception: ${e.message}`, exception: true }; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method==='OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RapidAPI-Key, X-RapidAPI-Host', 'Access-Control-Max-Age': '86400' } });
    }

    const backendUrl = (env.BACKEND_URL||'').replace(/\/+$/,'');
    const judge0Url = (env.JUDGE0_API_URL||'https://ce.judge0.com').replace(/\/+$/,'');
    const pistonUrl = (env.PISTON_API_URL||PISTON_API).replace(/\/+$/,'');

    if (pathname.startsWith('/api/')) {
      try {
        if (pathname==='/api/health' || pathname==='/api/health/') {
          if (backendUrl) {
            try { const r=await fetch(`${backendUrl}/api/health`, {headers:{Accept:'application/json'}}); const text=await r.text(); let data; try{data=JSON.parse(text);}catch{data={ok:r.ok};} return jsonResponse({ok:r.ok,mode:'proxy',backend:backendUrl,version:data.version||VERSION}, r.status); } catch(e){ return jsonResponse({ok:true,mode:'judge0',version:VERSION,warning:`backend proxy failed ${e.message}`}); }
          }
          return jsonResponse({ok:true,mode: judge0Url?'judge0':'piston',version:VERSION,timestamp:new Date().toISOString(),backends:{backend:!!backendUrl,judge0:!!judge0Url,piston:pistonUrl,wandbox:WANDBOX_API},note:'Piston 401 whitelist since 2026-02-15, Wandbox may 429, Judge0 CE recommended'});
        }

        if (pathname==='/api/template' || pathname==='/api/template/') {
          if (backendUrl) {
            try { const r=await fetch(`${backendUrl}/api/template`, {headers:{Accept:'application/json'}}); const text=await r.text(); let data; try{data=JSON.parse(text);}catch{data=null;} if(r.ok&&data&&data.code) return jsonResponse({language:data.language||'cpp',code:data.code,mode:'proxy'}); } catch(_){}
          }
          return jsonResponse({language:'cpp',code:DEFAULT_TEMPLATE,mode: judge0Url?'judge0':'wandbox'});
        }

        if (pathname==='/api/run' || pathname==='/api/run/') {
          if (request.method!=='POST') return jsonResponse({error:'Method not allowed, use POST'},405);
          let body; try{body=await request.json();}catch(e){return jsonResponse({error:'Invalid JSON',detail:e.message},400);}
          const code=body.code; const stdin=typeof body.stdin==='string'?body.stdin:'';
          if(typeof code!=='string'||!code.trim()) return jsonResponse({error:'code required'},400);
          if(code.length>64*1024) return jsonResponse({error:'code >64KB'},413);

          if (backendUrl) {
            try {
              const r=await fetch(`${backendUrl}/api/run`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,stdin})});
              const text=await r.text(); let j; try{j=JSON.parse(text);}catch{return jsonResponse({success:false,stage:'error',stderr:`Backend non-JSON ${r.status}: ${text.slice(0,1000)}`,stdout:''},502);}
              if(r.status===503||j.retryable||/crun: clone|OCI runtime|Resource temporarily unavailable/i.test(j.stderr||'')){ console.log(`Backend 503 ${r.status}, trying Judge0/Wandbox`); } else { return jsonResponse({...j,mode:'proxy',backend:backendUrl}, r.status); }
            } catch(e){ console.log(`Backend proxy exception ${e.message}, trying Judge0`); }
          }

          if (judge0Url) {
            const judge0Result=await tryJudge0(code,stdin,env);
            if(!judge0Result.error && !judge0Result.skipped) return jsonResponse(judge0Result, judge0Result.success?200:(judge0Result.stage==='compile'?200:500));
            console.log(`Judge0 failed: ${judge0Result.error}, trying Piston/Wandbox`);
          }

          const pistonResult=await tryPiston(code,stdin,pistonUrl);
          if(!pistonResult.error) return jsonResponse(pistonResult, pistonResult.success?200:(pistonResult.stage==='compile'?200:502));
          const isPistonWhitelist=pistonResult.isWhitelist||pistonResult.status===401||/whitelist only/i.test(pistonResult.error||'');
          console.log(`Piston failed ${pistonResult.status} whitelist=${isPistonWhitelist}: ${pistonResult.error}, trying Wandbox`);

          const wandboxResult=await tryWandbox(code,stdin);
          if(!wandboxResult.error || wandboxResult.stage) return jsonResponse(wandboxResult, wandboxResult.success?200:(wandboxResult.stage==='compile'?200:502));

          return jsonResponse({
            success:false,stage:'error',
            stderr:`All backends failed.\n\n1. BACKEND_URL: ${backendUrl||'(not set)'} — ${backendUrl?'tried proxy 503/crun':'not configured'}\n2. JUDGE0_API_URL: ${judge0Url||'(not set)'} — ${judge0Url?'tried, failed':'not configured — recommended! Deploy Judge0 CE: https://github.com/judge0/judge0'}\n   Quick self-host:\n   docker run -d --name judge0 -p 2358:2358 judge0/judge0:1.13.1\n   Then set JUDGE0_API_URL=http://your-ip:2358 and JUDGE0_LANGUAGE_ID=54\n   RapidAPI: https://rapidapi.com/judge0-official/api/judge0-ce\n\n3. PISTON: ${pistonUrl} — ${pistonResult.error?.slice(0,1000)}\n   Public Piston 401 since 2026-02-15 (https://github.com/engineer-man/piston#public-api)\n   Host your own: https://github.com/engineer-man/piston\n\n4. WANDBOX: ${WANDBOX_API} — ${wandboxResult.error?.slice(0,1000)}\n   Wandbox may return Resource temporarily unavailable / 429 under load\n\nFix:\n- Deploy own backend: docker-compose up -d --build (pids_limit 2048, mem 2GB) and set BACKEND_URL\n- Or deploy Judge0 CE and set JUDGE0_API_URL\n- Or host Piston and set PISTON_API_URL\n- Code was: ${code.slice(0,500)}\n`,
            stdout:'',mode:'all_failed',attempted:{backend:!!backendUrl,judge0:!!judge0Url,piston:pistonUrl,wandbox:WANDBOX_API},errors:{piston:pistonResult.error?.slice(0,500),wandbox:wandboxResult.error?.slice(0,500)}
          },502);
        }

        return jsonResponse({error:`Unknown API ${pathname}`,available:['/api/health','/api/template','/api/run']},404);
      } catch(err){ return jsonResponse({error:'Worker error',detail:String(err.message||err),stack:err.stack?.slice(0,2000)},500); }
    }

    try{ if(env.ASSETS){ const assetRes=await env.ASSETS.fetch(request); if(assetRes.status!==404) return assetRes; } }catch(_){}
    try{ const res=await fetch(request); if(res.status!==404) return res; }catch(_){}
    return new Response('Not found. Deploy as Pages with output public, or configure [assets] in wrangler.toml', {status:404,headers:{'Content-Type':'text/plain'}});
  },
};
