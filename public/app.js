/* ============================================================
 * ide.ankb — Frontend Controller (v9.5 UI/UX + Judge0 default)
 * Fixes:
 * - Judge0 CE default only (Judge0 removed per app branch request)
 * - Auto Save, Download/Open file, C++ version selector, Theme switch
 * - Connection badge 🟢/🟡/🔴 with tooltip + backend mode
 * - Output colors success/warning/error, loading states
 * - Ctrl+A/C/V/X/Z/Y allowed, devtools blocked
 * - Resizable gutter + minimap, ligatures, sticky scroll
 * ============================================================ */
(function () {
  'use strict';
  const API_BASE = (window.IDE_API_BASE || '').replace(/\/+$/, '');

  const els = {
    editor: document.getElementById('editor'),
    runBtn: document.getElementById('runBtn'),
    runLabel: document.getElementById('runLabel'),
    formatBtn: document.getElementById('formatBtn'),
    resetBtn: document.getElementById('resetBtn'),
    openFileBtn: document.getElementById('openFileBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    sideOpenFile: document.getElementById('sideOpenFile'),
    sideDownload: document.getElementById('sideDownload'),
    openFileInput: document.getElementById('openFileInput'),
    clearStdin: document.getElementById('clearStdinBtn'),
    clearOut: document.getElementById('clearOutBtn'),
    closeTab: document.getElementById('closeTab'),
    stdin: document.getElementById('stdin'),
    output: document.getElementById('output'),
    fileName: document.getElementById('fileName'),
    tabFile: document.getElementById('tabFile'),
    timeChip: document.getElementById('timeChip'),
    statusCursor: document.getElementById('statusCursor'),
    statusMsg: document.getElementById('statusMsg'),
    statusTime: document.getElementById('statusTime'),
    statusLang: document.getElementById('statusLang'),
    statusEncoding: document.getElementById('statusEncoding'),
    statusSpaces: document.getElementById('statusSpaces'),
    statusBackend: document.getElementById('statusBackend'),
    netDot: document.getElementById('netDot'),
    netLabel: document.getElementById('netLabel'),
    connBadge: document.getElementById('connBadge'),
    connTooltip: document.getElementById('connTooltip'),
    toastHost: document.getElementById('toastHost'),
    gutter: document.getElementById('gutter'),
    cppVersion: document.getElementById('cppVersion'),
    themeSelect: document.getElementById('themeSelect'),
    langChip: document.getElementById('langChip'),
    autoSaveChip: document.getElementById('autoSaveChip'),
    buildProgress: document.getElementById('buildProgress'),
    buildBar: document.getElementById('buildBar'),
    menuFile: document.getElementById('menuFile'),
    menuEdit: document.getElementById('menuEdit'),
    menuView: document.getElementById('menuView'),
    menuRun: document.getElementById('menuRun'),
    menuHelp: document.getElementById('menuHelp'),
  };

  let editor = null;
  let defaultTemplate = '';
  let running = false;
  let currentBackendMode = '—';
  let autoSaveInterval = null;

  const FALLBACK_TEMPLATE = `#include <bits/stdc++.h>
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


  // Test Cases feature (user consent) - per request: thêm tính năng test cases nếu ng dùng đồng ý
  let testCases = [];
  let testCasesEnabled = false;

  function loadTestCases(){
    try{
      const stored = JSON.parse(localStorage.getItem('ide.ankb:testCases')||'null');
      if(Array.isArray(stored)) testCases = stored;
      else testCases = [
        { id: 1, input: '5\n1 2 3 4 5', expected: '15', status: 'idle' },
        { id: 2, input: '3\n1 2 3', expected: '6', status: 'idle' }
      ];
      testCasesEnabled = localStorage.getItem('ide.ankb:testCasesEnabled')==='true';
    }catch{ testCases = [{ id: 1, input: '5\n1 2 3 4 5', expected: '15', status: 'idle' }]; testCasesEnabled = false; }
  }
  function saveTestCases(){
    try{
      localStorage.setItem('ide.ankb:testCases', JSON.stringify(testCases));
      localStorage.setItem('ide.ankb:testCasesEnabled', testCasesEnabled.toString());
    }catch{}
  }
  function renderTestCases(){
    const list = document.getElementById('testCasesList');
    if(!list) return;
    list.innerHTML='';
    testCases.forEach(tc=>{
      const div=document.createElement('div');
      div.className='test-case'+(tc.status==='running'?' active':'');
      div.innerHTML=`
        <div class="tc-head">
          <span>Test #${tc.id}</span>
          <span class="tc-status ${tc.status}">${tc.status==='pass'?'✔ Pass':tc.status==='fail'?'✗ Fail':tc.status==='running'?'⏳ Running':'idle'}</span>
        </div>
        <div class="tc-body">
          <div>
            <div style="font-size:10px;color:var(--text-mute);margin-bottom:2px">Input</div>
            <div class="tc-io" contenteditable="true" data-field="input" data-id="${tc.id}">${(tc.input||'').replace(/</g,'&lt;')}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text-mute);margin-bottom:2px">Expected</div>
            <div class="tc-io ${tc.status==='fail'?'mismatch':tc.status==='pass'?'match':''}" contenteditable="true" data-field="expected" data-id="${tc.id}">${(tc.expected||'').replace(/</g,'&lt;')}</div>
          </div>
        </div>
        <div style="margin-top:4px;display:flex;gap:4px">
          <button class="icon-btn" style="width:auto;padding:2px 6px;font-size:10px" onclick="window.deleteTestCase(${tc.id})">Delete</button>
          <button class="icon-btn" style="width:auto;padding:2px 6px;font-size:10px" onclick="window.runSingleTest(${tc.id})">Run</button>
        </div>
        ${tc.actual!==undefined?`<div style="margin-top:6px"><div style="font-size:10px;color:var(--text-mute)">Actual</div><div class="tc-io ${tc.status==='pass'?'match':'mismatch'}">${(tc.actual||'').replace(/</g,'&lt;')}</div></div>`:''}
      `;
      list.appendChild(div);
    });
    list.querySelectorAll('[contenteditable]').forEach(el=>{
      el.addEventListener('blur', (e)=>{
        const id=parseInt(e.target.dataset.id);
        const field=e.target.dataset.field;
        const tc=testCases.find(t=>t.id===id);
        if(tc){ tc[field]=e.target.textContent; saveTestCases(); }
      });
    });
  }
  window.deleteTestCase=(id)=>{ testCases=testCases.filter(t=>t.id!==id); saveTestCases(); renderTestCases(); };
  window.runSingleTest=async (id)=>{
    const tc=testCases.find(t=>t.id===id);
    if(!tc) return;
    tc.status='running'; renderTestCases();
    const result=await runSingleTestCase(tc);
    tc.status=result.pass?'pass':'fail';
    tc.actual=result.actual;
    saveTestCases(); renderTestCases();
  };
  async function runSingleTestCase(tc){
    try{
      const code=editor.getValue();
      const r=await fetch(API_BASE+'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code, stdin: tc.input})});
      const text=await r.text(); let j; try{j=text?JSON.parse(text):{};}catch{j={};}
      const actual=(j.stdout||'').trim();
      const expected=(tc.expected||'').trim();
      const pass=actual===expected;
      return {pass, actual, expected, result:j};
    }catch(e){
      return {pass:false, actual:'Error: '+e.message, expected: tc.expected, result:null};
    }
  }
  async function runAllTests(){
    if(!testCasesEnabled){
      if(!confirm('Enable Test Cases? This will run all test cases sequentially.\n\nUser consent required as per your request.')) return;
      testCasesEnabled=true;
      const cb=document.getElementById('enableTestCases');
      if(cb) cb.checked=true;
      saveTestCases();
    }
    for(const tc of testCases){
      tc.status='running'; renderTestCases();
      const res=await runSingleTestCase(tc);
      tc.status=res.pass?'pass':'fail';
      tc.actual=res.actual;
      saveTestCases(); renderTestCases();
      await new Promise(r=>setTimeout(r,100));
    }
    const passed=testCases.filter(t=>t.status==='pass').length;
    const el=document.getElementById('toastHost');
    // Use existing toast function if available, else alert
    if(typeof toast==='function') toast(`Tests: ${passed}/${testCases.length} passed`, passed===testCases.length?'ok':'warn',3000);
  }
  window.runAllTests=runAllTests;


  const THEMES = {
    'ide-dark': { label: 'Dark+', base: 'vs-dark' },
    'vs-dark': { label: 'VS Dark', base: 'vs-dark' },
    'hc-black': { label: 'High Contrast', base: 'hc-black' },
    'github-dark': { label: 'GitHub Dark', base: 'vs-dark' },
  };

  const CPP_VERSIONS = {
    '11': { std: 'c++11', judge0: 52 },
    '14': { std: 'c++14', judge0: 52 },
    '17': { std: 'c++17', judge0: 54 },
    '20': { std: 'c++20', judge0: 54 },
    '23': { std: 'c++23', judge0: 54 },
  };

  function toast(message, type='info', timeout=3500){
    const el=document.createElement('div');
    el.className='toast '+(type==='error'?'error':type==='ok'?'ok':type==='warn'?'warn':'');
    el.textContent=message;
    els.toastHost.appendChild(el);
    setTimeout(()=>{ el.style.transition='opacity .25s ease, transform .25s ease'; el.style.opacity='0'; el.style.transform='translateY(6px)'; setTimeout(()=>el.remove(),250); }, timeout);
  }

  function defineTheme(monaco, id){
    if(id==='ide-dark'){
      monaco.editor.defineTheme('ide-dark', {
        base:'vs-dark', inherit:true,
        rules:[
          {token:'comment',foreground:'6e7681',fontStyle:'italic'},
          {token:'keyword',foreground:'ff7b72'},
          {token:'string',foreground:'a5d6ff'},
          {token:'number',foreground:'79c0ff'},
          {token:'type',foreground:'ffa657'},
          {token:'identifier',foreground:'c9d1d9'},
        ],
        colors:{
          'editor.background':'#0d1117','editor.foreground':'#c9d1d9',
          'editorLineNumber.foreground':'#3a4148','editorLineNumber.activeForeground':'#c9d1d9',
          'editor.lineHighlightBackground':'#161b22','editor.lineHighlightBorder':'#161b22',
          'editorCursor.foreground':'#58a6ff','editor.selectionBackground':'#264f78',
          'editor.inactiveSelectionBackground':'#1f3a5a','editorWhitespace.foreground':'#21262d',
          'editorIndentGuide.background':'#21262d','editorIndentGuide.activeBackground':'#30363d',
          'editorBracketMatch.background':'#1f3a5a','editorBracketMatch.border':'#58a6ff',
          'scrollbarSlider.background':'#21262d80','scrollbarSlider.hoverBackground':'#30363d','scrollbarSlider.activeBackground':'#484f58',
        },
      });
    } else if(id==='github-dark'){
      monaco.editor.defineTheme('github-dark', {
        base:'vs-dark', inherit:true,
        rules:[
          {token:'comment',foreground:'8b949e',fontStyle:'italic'},
          {token:'keyword',foreground:'ff7b72'},
          {token:'string',foreground:'a5d6ff'},
          {token:'number',foreground:'79c0ff'},
        ],
        colors:{
          'editor.background':'#0d1117','editor.foreground':'#e6edf3',
          'editorLineNumber.foreground':'#484f58','editor.lineHighlightBackground':'#161b22',
        },
      });
    }
  }

  function loadMonaco(){
    if(window.__monacoReady) return window.__monacoReady();
    return new Promise((resolve,reject)=>{
      if(!window.require) return reject(new Error('Monaco loader missing'));
      window.require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'}});
      window.require(['vs/editor/editor.main'],()=>resolve(window.monaco),(err)=>reject(err));
    });
  }

  async function fetchTemplate(){
    try{
      const r=await fetch(API_BASE+'/api/template',{cache:'no-store'});
      const text=await r.text(); let j; try{j=text?JSON.parse(text):{};}catch(e){throw new Error(`Template parse error: ${e.message}`);}
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      return j.code||j.template||'';
    }catch(e){ console.warn('[ide.ankb] fetchTemplate fallback',e.message); return FALLBACK_TEMPLATE; }
  }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

  function renderOutput(result){
    const o=els.output; o.innerHTML=''; o.className='output';
    if(!result){ o.innerHTML='<div class="empty">// Run your code to see the output here</div>'; return; }

    // Determine color class
    let colorClass='info';
    if(result.success) colorClass='success';
    else if(result.stage==='compile') colorClass='error';
    else if(result.stage==='error'){
      const errText=(result.stderr||'').toLowerCase();
      if(errText.includes('oci runtime')||errText.includes('crun: clone')||errText.includes('resource temporarily unavailable')) colorClass='warning';
      else if(errText.includes('piston 401')||errText.includes('whitelist')) colorClass='warning';
      else colorClass='error';
    } else if(result.timed_out) colorClass='warning';
    else colorClass='error';
    o.classList.add(colorClass);

    if(result.stage==='compile' || (result.compile_error && result.compile_error.trim())){
      const h=document.createElement('div'); const rawErr=result.compile_error||result.stderr||'(no stderr)';
      const isOci=/OCI runtime error|crun: clone|Resource temporarily unavailable|fork: retry|Cannot allocate memory|pids_limit|crun/i.test(rawErr);
      if(isOci){
        h.innerHTML='<div style="color:#f85149;font-weight:600;margin-bottom:6px;">⚠️ Container overloaded (crun clone EAGAIN)</div>';
        const pre=document.createElement('div'); pre.className='stderr'; pre.style.whiteSpace='pre-wrap';
        pre.textContent=rawErr+'\n\n--- Fix applied in backend ---\n- nproc 64→512, compile RAM 1GB, pids_limit 2048\n- Concurrency limit 6, auto fallback to Judge0\n\nActions:\n1. docker-compose down && up -d --build\n2. Wait 2s and Run again → auto Judge0\n3. Set JUDGE0_API_URL for stable backend';
        h.appendChild(pre);
        const retryBtn=document.createElement('button'); retryBtn.textContent='🔄 Retry with Judge0 CE fallback'; retryBtn.style.marginTop='10px'; retryBtn.style.padding='6px 12px'; retryBtn.style.background='#238636'; retryBtn.style.color='#fff'; retryBtn.style.border='1px solid #2ea043'; retryBtn.style.borderRadius='6px'; retryBtn.style.cursor='pointer';
        retryBtn.onclick=()=>{ window.dispatchEvent(new KeyboardEvent('keydown',{key:'F9'})); };
        h.appendChild(retryBtn); o.appendChild(h);
      } else {
        h.innerHTML='<div style="color:#f85149;font-weight:600;margin-bottom:6px;">❌ Compile Error</div>';
        // Try to parse line numbers like main.cpp:12
        const pre=document.createElement('div'); pre.className='stderr'; pre.style.whiteSpace='pre-wrap';
        // Highlight file:line
        const highlighted=rawErr.replace(/((?:main\.cpp|file|line|:)(\d+):?(\d+)?)/gi, (m)=>`→ ${m}`);
        pre.textContent=rawErr; h.appendChild(pre);
        // If contains main.cpp:line, make clickable to jump
        const lines=rawErr.split('\n');
        lines.forEach(l=>{
          const m=l.match(/main\.cpp:(\d+):(\d+)?/);
          if(m && editor){
            const jump=document.createElement('div'); jump.style.fontSize='11px'; jump.style.color='#58a6ff'; jump.style.cursor='pointer'; jump.style.marginTop='2px';
            jump.textContent=`↳ Jump to line ${m[1]}:${m[2]||1}`;
            jump.onclick=()=>{ if(editor){ editor.revealLineInCenter(parseInt(m[1])); editor.setPosition({lineNumber:parseInt(m[1]), column:parseInt(m[2]||1)}); editor.focus(); } };
            h.appendChild(jump);
          }
        });
        o.appendChild(h);
      }
    } else if(result.stage==='error'){
      const h=document.createElement('div'); h.innerHTML='<div style="color:#f85149;font-weight:600;margin-bottom:8px;">💥 Runtime Error / API not reachable</div>';
      const pre=document.createElement('div'); pre.className='stderr'; pre.style.whiteSpace='pre-wrap'; pre.textContent=result.stderr||result.compile_error||'Unknown error'; h.appendChild(pre);
      const guide=document.createElement('div'); guide.style.marginTop='12px'; guide.style.padding='10px'; guide.style.background='#161b22'; guide.style.border='1px solid #30363d'; guide.style.borderRadius='8px'; guide.style.fontSize='12px'; guide.style.lineHeight='1.5';
      const mode=result.mode||currentBackendMode||'unknown';
      const backendInfo=result.backend||'—';
      guide.innerHTML=`<div style="font-weight:600;color:#58a6ff;margin-bottom:6px;">💡 Fix (ide.ankb):</div>
        <div style="color:#8b949e;">
          <b>Backend:</b> ${escapeHtml(mode)}<br>
          <b>Error:</b> ${(result.stderr||'').slice(0,500)}<br><br>
          1. <b>Judge0 CE (recommended):</b> Deploy Judge0: <code>docker run -p 2358:2358 judge0/judge0:1.13.1</code> + set <code>JUDGE0_API_URL</code><br>
          
          3. <b>Piston</b> 401 whitelist since 2026-02-15 — needs self-host<br>
          4. <b>Self-host backend:</b> <code>docker-compose up -d --build</code> (pids_limit 2048, mem 2GB)<br>
        </div>`;
      h.appendChild(guide); o.appendChild(h);
    } else {
      const out=result.stdout||'';
      if(out.length){ const pre=document.createElement('div'); pre.className='stdout'; pre.textContent=out; o.appendChild(pre); }
      else { const empty=document.createElement('div'); empty.className='empty'; empty.textContent='// (no stdout)'; o.appendChild(empty); }
      if(result.stderr&&result.stderr.trim()){ const pre=document.createElement('div'); pre.className='stderr'; pre.style.marginTop='10px'; pre.textContent='[stderr]\n'+result.stderr; o.appendChild(pre); }
    }
    const meta=document.createElement('div'); meta.className='meta';
    const ok=result.success;
    meta.innerHTML=`
      <span class="${ok?'ok':'err'}">${ok?'✅ Success':'❌ Failed'}</span>
      <span>stage: ${escapeHtml(result.stage||'run')}</span>
      <span>time: ${escapeHtml(String(result.durationMs??'—'))} ms</span>
      ${result.exit_code!=null?`<span>exit: ${escapeHtml(String(result.exit_code))}</span>`:''}
      ${result.timed_out?'<span class="err">⏳ TLE (2s)</span>':''}
      ${result.signal?`<span>signal: ${escapeHtml(String(result.signal))}</span>`:''}
      ${result.mode?`<span>🔧 ${escapeHtml(String(result.mode))}</span>`:''}
      ${result.compiler?`<span>⚙️ ${escapeHtml(String(result.compiler))}</span>`:''}
    `;
    o.appendChild(meta);
  }

  async function tryJudge0Direct(code, stdin){
    // Try public Judge0 CE without key first, then fallback
    const publicEndpoints=[
      'https://ce.judge0.com',
      // RapidAPI requires key, skip unless env var
    ];
    const envJudge0 = (window.__env && window.__env.JUDGE0_API_URL) || '';
    const endpoints=envJudge0?[envJudge0]:publicEndpoints;
    for(const base of endpoints){
      try{
        const url=`${base.replace(/\/+$/,'')}/submissions?base64_encoded=false&wait=true`;
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_code:code,language_id:54,stdin:stdin||''})});
        const text=await res.text(); let data; try{data=JSON.parse(text);}catch{continue;}
        if(!res.ok) continue;
        const stdout=data.stdout||''; const stderr=data.stderr||''; const compileOutput=data.compile_output||'';
        const statusId=data.status?.id;
        if(statusId===6 || (compileOutput&&compileOutput.trim())){
          return { success:false, stage:'compile', compile_error:compileOutput||stderr||'Compilation failed', stdout, stderr, mode:'judge0-direct' };
        }
        const isSuccess=statusId===3;
        return { success:isSuccess, stage:'run', stdout, stderr, compile_error:'', exit_code:isSuccess?0:(statusId||1), timed_out:statusId===5, mode:'judge0-direct' };
      }catch(e){ continue; }
    }
    return null;
  }

  async function run(){
    if(running) return;
    running=true;
    els.runBtn.disabled=true;
    els.runBtn.classList.add('running');
    els.runBtn.classList.remove('success','failed');
    const origLabel=els.runLabel.textContent;
    els.runLabel.innerHTML='<span class="spinner"></span> ⏳ Compiling...';
    els.statusMsg.textContent='⏳ Compiling...';
    els.statusTime.textContent='— ms'; els.timeChip.textContent='— ms';
    if(els.buildProgress){ els.buildProgress.style.display='block'; els.buildBar.style.width='30%'; }
    const code=editor.getValue();
    const stdin=els.stdin.value;
    const cppVer=els.cppVersion ? els.cppVersion.value : '17';
    const t0=performance.now();

    try{
      const r=await fetch(API_BASE+'/api/run',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code, stdin, version: cppVer, cppVersion: cppVer}),
      });
      const text=await r.text(); let j; try{j=text?JSON.parse(text):{};}catch(parseErr){
        const total=+(performance.now()-t0).toFixed(1);
        console.error('[ide.ankb] non-JSON',parseErr,text.slice(0,1000));
        renderOutput({success:false,stage:'error',stderr:`API returned invalid JSON (status ${r.status}).\nRaw: ${text.slice(0,1000)}\nParse: ${parseErr.message}`,durationMs:total,mode:'parse_error'});
        setNetwork(false,'API returned HTML not JSON');
        els.statusMsg.textContent='❌ API error'; return;
      }
      const total=+(performance.now()-t0).toFixed(1);
      const isRetryable=r.status===503||j.retryable||/OCI runtime|crun: clone|Resource temporarily unavailable|Server busy|pids_limit|Piston 401|whitelist only|Judge0/i.test((j.stderr||'')+(j.error||'')+(j.detail||'')+text);

      if(isRetryable && !window.__retried){
        console.warn('[ide.ankb] retryable error, trying Judge0 then Judge0 direct',j);
        toast('Backend busy, retrying with Judge0 CE...','warn',3000);
        if(els.buildBar) els.buildBar.style.width='60%';
        // Try Judge0 direct first (as default per user request)
        let fallback=await tryJudge0Direct(code, stdin);
        if(fallback){
          fallback.durationMs=total;
          renderOutput(fallback);
          setNetwork(true, fallback.mode||'fallback');
          currentBackendMode=fallback.mode||'fallback';
          if(els.statusBackend) els.statusBackend.textContent=`Mode: ${currentBackendMode}`;
          els.statusMsg.textContent=fallback.success?'✔ Success':'❌ Failed';
          els.statusTime.textContent=total+' ms'; els.timeChip.textContent=total+' ms';
          els.runBtn.classList.remove('running'); els.runBtn.classList.add(fallback.success?'success':'failed');
          els.runLabel.textContent=fallback.success?'✔ Success':'❌ Failed';
          setTimeout(()=>{ els.runBtn.classList.remove('success','failed'); els.runLabel.textContent=origLabel; }, 3000);
          window.__retried=true; setTimeout(()=>{window.__retried=false;},5000);
          if(els.buildProgress) els.buildProgress.style.display='none';
          return;
        }
      }
      window.__retried=false;

      if(!r.ok){
        renderOutput({success:false,stage:'error',stderr:j.error||j.stderr||j.detail||('HTTP '+r.status+': '+text.slice(0,1000)),compile_error:j.compile_error||'',durationMs:total,mode:j.mode||currentBackendMode});
        setNetwork(false, `HTTP ${r.status} ${j.error||''}`.trim(), j.mode);
        toast('Request failed: '+(j.error||j.stderr||r.status),'error');
        els.statusMsg.textContent='❌ Error';
        els.runBtn.classList.remove('running'); els.runBtn.classList.add('failed'); els.runLabel.textContent='❌ Failed';
      } else {
        j.durationMs=j.durationMs??total;
        renderOutput(j);
        currentBackendMode=j.mode||currentBackendMode;
        if(els.statusBackend) els.statusBackend.textContent=`Mode: ${currentBackendMode}`;
        setNetwork(true, `Connected via ${currentBackendMode}`, j.mode);
        if(j.success){
          els.statusMsg.textContent='✔ Success';
          toast('Run completed in '+j.durationMs+' ms ['+(j.mode||'')+']','ok',2000);
          els.runBtn.classList.add('success'); els.runLabel.textContent='✔ Success';
        } else if(j.timed_out){ els.statusMsg.textContent='⏳ TLE'; toast('Time limit exceeded','warn'); els.runBtn.classList.add('failed'); els.runLabel.textContent='❌ TLE'; }
        else if(j.stage==='compile'){ els.statusMsg.textContent='❌ Compile Error'; toast('Compilation error','error'); els.runBtn.classList.add('failed'); els.runLabel.textContent='❌ Compile Error'; }
        else { els.statusMsg.textContent='💥 Runtime'; toast('Runtime error exit '+ (j.exit_code??'?'),'warn'); els.runBtn.classList.add('failed'); els.runLabel.textContent='💥 Failed'; }
        els.statusTime.textContent=j.durationMs+' ms'; els.timeChip.textContent=j.durationMs+' ms';
        setTimeout(()=>{ els.runBtn.classList.remove('success','failed','running'); els.runLabel.textContent=origLabel; }, 2500);
      }
    }catch(e){
      setNetwork(false, e.message, 'offline');
      renderOutput({success:false,stage:'error',stderr:`Network error: ${String(e&&e.message||e)}\n\n- Piston 401 whitelist, Judge0 CE, Judge0 recommended\n- Check F12 > Network > /api/run`,durationMs:+(performance.now()-t0).toFixed(1)});
      toast('Network error: '+(e.message||e),'error'); els.statusMsg.textContent='🔴 Offline';
      els.runBtn.classList.remove('running'); els.runBtn.classList.add('failed'); els.runLabel.textContent='❌ Offline';
    } finally {
      running=false; els.runBtn.disabled=false;
      if(els.buildProgress){ els.buildBar.style.width='100%'; setTimeout(()=>{ if(els.buildProgress) els.buildProgress.style.display='none'; els.buildBar.style.width='0%'; }, 500); }
    }
  }

  function setNetwork(ok, msg, mode){
    if(mode) currentBackendMode=mode;
    if(els.statusBackend) els.statusBackend.textContent=`Mode: ${currentBackendMode||'—'}`;
    if(!els.connBadge) return;
    if(ok===true){
      els.connBadge.className='badge online';
      els.netLabel.textContent='🟢 Online';
      if(els.connTooltip) els.connTooltip.textContent=`Connected via ${currentBackendMode||'backend'}\nBackend: ${currentBackendMode}\n${msg||''}\nClick to re-check`;
    } else if(ok==='connecting'){
      els.connBadge.className='badge connecting';
      els.netLabel.textContent='🟡 Connecting...';
      if(els.connTooltip) els.connTooltip.textContent=`Connecting...\n${msg||''}`;
    } else {
      els.connBadge.className='badge offline';
      els.netLabel.textContent='🔴 Offline';
      if(els.connTooltip) els.connTooltip.textContent=`Backend unavailable\nMode: ${currentBackendMode}\nError: ${msg||'Unknown'}\nFix:\n- Deploy backend: docker-compose up -d\n- Or set JUDGE0_API_URL\n- Or set JUDGE0_API_URL`;
    }
  }

  function downloadFile(){
    const code=editor?editor.getValue():'';
    const blob=new Blob([code],{type:'text/x-c++src'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='main.cpp'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast('Downloaded main.cpp','ok',1500);
  }

  function openFile(file){
    const reader=new FileReader();
    reader.onload=(e)=>{
      const text=e.target.result;
      if(editor){ editor.setValue(text); toast('Opened '+file.name,'ok',1500); }
      if(els.fileName) els.fileName.textContent=file.name;
      if(els.tabFile) els.tabFile.textContent=file.name;
      localStorage.setItem('ide.ankb:lastFileName', file.name);
    };
    reader.readAsText(file);
  }

  function bindEditor(monaco){
    defineTheme(monaco,'ide-dark');
    defineTheme(monaco,'github-dark');
    const theme=localStorage.getItem('ide.ankb:theme')||'ide-dark';
    const cppVer=localStorage.getItem('ide.ankb:cppVersion')||'23';

    editor=monaco.editor.create(els.editor,{
      value:defaultTemplate,
      language:'cpp',
      theme: theme,
      fontFamily:'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontLigatures:true,
      fontSize:14,
      lineHeight:22,
      minimap:{enabled:true,scale:1,renderCharacters:false},
      scrollBeyondLastLine:false,
      smoothScrolling:true,
      cursorBlinking:'phase',
      cursorSmoothCaretAnimation:'on',
      tabSize:4,
      insertSpaces:true,
      renderWhitespace:'selection',
      renderLineHighlight:'all',
      roundedSelection:true,
      padding:{top:12,bottom:12},
      scrollbar:{verticalScrollbarSize:10,horizontalScrollbarSize:10,useShadows:false},
      automaticLayout:true,
      fixedOverflowWidgets:true,
      suggestOnTriggerCharacters:true,
      quickSuggestions:{other:true,comments:false,strings:false},
      bracketPairColorization:{enabled:true},
      guides:{bracketPairs:true,indentation:true},
      'semanticHighlighting.enabled':true,
      stickyScroll:{enabled:true},
      // Glassmorphism hint
    });

    // Restore theme selector
    if(els.themeSelect){ els.themeSelect.value=theme; els.themeSelect.addEventListener('change',(e)=>{ const t=e.target.value; monaco.editor.setTheme(t); localStorage.setItem('ide.ankb:theme',t); toast('Theme: '+t,'ok',1200); }); }
    if(els.cppVersion){ els.cppVersion.value=cppVer; els.langChip.textContent='C++'+cppVer; els.statusLang.textContent='C++'+cppVer; els.cppVersion.addEventListener('change',(e)=>{ const v=e.target.value; localStorage.setItem('ide.ankb:cppVersion',v); if(els.langChip) els.langChip.textContent='C++'+v; if(els.statusLang) els.statusLang.textContent='C++'+v; toast('C++ standard: C++'+v,'ok',1200); }); }

    editor.onDidChangeCursorPosition((e)=>{ els.statusCursor.textContent=`Ln ${e.position.lineNumber}, Col ${e.position.column}`; });
    editor.onDidChangeModelContent(()=>{
      const dirty=editor.getModel().getValue()!==defaultTemplate;
      els.fileName.textContent=dirty?'● main.cpp':'main.cpp';
      els.tabFile.textContent=dirty?'● main.cpp':'main.cpp';
      // Auto Save
      clearTimeout(window.__autoSaveTimer);
      window.__autoSaveTimer=setTimeout(()=>{
        try{
          localStorage.setItem('ide.ankb:code', editor.getValue());
          localStorage.setItem('ide.ankb:stdin', els.stdin.value);
          if(els.autoSaveChip){ els.autoSaveChip.textContent='Auto Save ✓ '+new Date().toLocaleTimeString(); setTimeout(()=>{ els.autoSaveChip.textContent='Auto Save ✓'; },2000); }
        }catch(_){}
      }, 800);
    });

    // Restore auto saved code
    try{
      const savedCode=localStorage.getItem('ide.ankb:code');
      const savedStdin=localStorage.getItem('ide.ankb:stdin');
      if(savedCode && savedCode.trim().length>10){ editor.setValue(savedCode); toast('Restored auto-saved code','ok',1500); }
      if(savedStdin!==null) els.stdin.value=savedStdin;
    }catch(_){}

    setTimeout(()=>{ try{ editor.getAction('editor.action.formatDocument').run(); }catch(_){} },50);
    editor.addCommand(monaco.KeyCode.F9, run);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
    // Command Palette
    editor.addCommand(monaco.KeyCode.F1, ()=>{ editor.getAction('editor.action.quickCommand').run(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, ()=>{ editor.getAction('editor.action.quickCommand').run(); });

    window.addEventListener('keydown',(ev)=>{ if(ev.key==='F9'){ ev.preventDefault(); run(); } });

    // Top bar
    els.runBtn.addEventListener('click', run);
    if(els.resetBtn) els.resetBtn.addEventListener('click',()=>{ if(editor.getValue()!==defaultTemplate && !confirm('Reset to default template?')) return; editor.setValue(defaultTemplate); toast('Template restored','ok',1500); });
    if(els.formatBtn) els.formatBtn.addEventListener('click',()=>{ try{ editor.getAction('editor.action.formatDocument').run(); }catch(_){} });
    if(els.closeTab) els.closeTab.addEventListener('click',()=>{ if(!confirm('Clear editor?')) return; editor.setValue(''); });
    if(els.clearStdin) els.clearStdin.addEventListener('click',()=>{ els.stdin.value=''; els.stdin.focus(); localStorage.setItem('ide.ankb:stdin',''); });
    if(els.clearOut) els.clearOut.addEventListener('click',()=>{ renderOutput(null); });
    if(els.downloadBtn) els.downloadBtn.addEventListener('click', downloadFile);
    if(els.sideDownload) els.sideDownload.addEventListener('click', downloadFile);
    if(els.openFileBtn) els.openFileBtn.addEventListener('click',()=>{ els.openFileInput.click(); });
    if(els.sideOpenFile) els.sideOpenFile.addEventListener('click',()=>{ els.openFileInput.click(); });
    if(els.openFileInput) els.openFileInput.addEventListener('change',(e)=>{ const f=e.target.files[0]; if(f) openFile(f); e.target.value=''; });

    // File menu
    if(els.menuFile) els.menuFile.addEventListener('click',()=>{ 
      const choice=prompt('File: 1=Open (Ctrl+O), 2=Download (Ctrl+S), 3=Reset');
      if(choice==='1') els.openFileInput.click();
      else if(choice==='2') downloadFile();
      else if(choice==='3' && confirm('Reset?')) editor.setValue(defaultTemplate);
    });

    setupGutter();

    const guard=window.IDE_GUARD||window.IDE_SECURITY;
    if(guard){
      guard.setActions({
        run:()=>run(),
        format:()=>{ try{ editor.getAction('editor.action.formatDocument').run(); }catch(_){} },
        reset:()=>{ if(editor.getValue()!==defaultTemplate && !confirm('Reset?')) return; editor.setValue(defaultTemplate); toast('Template restored','ok',1500); },
        clearInput:()=>{ els.stdin.value=''; els.stdin.focus(); },
        clearOutput:()=>renderOutput(null),
        openFile:()=>{ els.openFileInput.click(); },
        download:()=>{ downloadFile(); },
        copyOutput:()=>{
          const text=els.output.innerText.replace(/\n+$/,'');
          if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(()=>toast('Output copied','ok',1200),()=>fallbackCopy(text)); }
          else fallbackCopy(text);
        },
        about:()=>{ alert('ide.ankb — C++ Online IDE\nEditor: Monaco 0.45.0\nEngine: Node.js + g++ 14 / Judge0 CE only (Judge0 removed)\nFeatures: Auto Save, Minimap, Theme switch, C++20/23 selector, Download/Open\n© '+new Date().getFullYear()+' ide.ankb'); },
      });
      guard.onDevToolsChange((open)=>{ if(open){ setNetwork(false,'DevTools open','—'); els.statusMsg.textContent='DevTools open'; } else { setNetwork(true,'Ready',currentBackendMode); els.statusMsg.textContent='Ready'; } });
    }

    // Connection check retry on badge click
    if(els.connBadge) els.connBadge.addEventListener('click',()=>{ setNetwork('connecting','Checking...'); ping(); });
  }

  function fallbackCopy(text){
    try{
      const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('Output copied','ok',1200);
    }catch(e){ toast('Copy failed','error',2000); }
  }

  function setupGutter(){
    const workarea=document.querySelector('.workarea'); if(!workarea||!els.gutter) return;
    let dragging=false;
    els.gutter.addEventListener('mousedown',(e)=>{ dragging=true; document.body.style.cursor='col-resize'; e.preventDefault(); });
    window.addEventListener('mousemove',(e)=>{
      if(!dragging) return;
      const total=workarea.getBoundingClientRect().width;
      const x=e.clientX-workarea.getBoundingClientRect().left;
      const leftPct=Math.max(0.2,Math.min(0.85,x/total));
      workarea.style.gridTemplateColumns=`${leftPct*100}% 8px 1fr`;
      if(editor) editor.layout();
      localStorage.setItem('ide.ankb:split', leftPct);
    });
    window.addEventListener('mouseup',()=>{ dragging=false; document.body.style.cursor=''; });
    // Restore split
    try{ const saved=parseFloat(localStorage.getItem('ide.ankb:split')); if(!isNaN(saved)&&saved>0.2&&saved<0.85){ workarea.style.gridTemplateColumns=`${saved*100}% 8px 1fr`; } }catch(_){}
  }

  async function ping(){
    setNetwork('connecting','Pinging /api/health...');
    try{
      const r=await fetch(API_BASE+'/api/health',{cache:'no-store'});
      const text=await r.text(); let j; try{j=text?JSON.parse(text):{};}catch{j={};}
      const ok=r.ok && (j.ok!==false);
      const mode=j.mode||'unknown';
      const backend=j.backend||j.judge0||'';
      setNetwork(ok, `${mode} ${backend?`(${backend})`:''}`, mode);
      if(els.statusBackend) els.statusBackend.textContent=`Mode: ${mode}`;
      currentBackendMode=mode;
    }catch(_){ setNetwork(false,'Failed to fetch /api/health','offline'); }
  }

  // Test Cases init
  loadTestCases();
  // Render test cases initially and bind buttons
  setTimeout(()=>{
    try{
      renderTestCases();
      const addBtn=document.getElementById('addTestCaseBtn');
      if(addBtn) addBtn.addEventListener('click',()=>{
        const newId=testCases.length ? Math.max(...testCases.map(t=>t.id))+1 : 1;
        testCases.push({id:newId, input:'', expected:'', status:'idle'});
        saveTestCases(); renderTestCases();
      });
      const runAllBtn=document.getElementById('runAllTestsBtn');
      if(runAllBtn) runAllBtn.addEventListener('click',()=>runAllTests());
      const toggleBtn=document.getElementById('toggleTestCasesBtn');
      if(toggleBtn) toggleBtn.addEventListener('click',()=>{
        const body=document.getElementById('testCasesBody');
        if(body) body.style.display=body.style.display==='none'?'block':'none';
      });
      const enableCb=document.getElementById('enableTestCases');
      if(enableCb){
        enableCb.checked=testCasesEnabled;
        enableCb.addEventListener('change',(e)=>{
          testCasesEnabled=e.target.checked;
          saveTestCases();
        });
      }
    }catch(e){ console.warn('Test cases bind failed', e); }
  }, 500);

  (async function main(){
    setNetwork('connecting','Initializing...'); ping(); setInterval(ping,15000);
    defaultTemplate=await fetchTemplate();
    try{
      const monaco=await loadMonaco(); bindEditor(monaco); els.statusMsg.textContent='Ready';
      // Auto Save chip
      if(els.autoSaveChip) els.autoSaveChip.textContent='Auto Save ✓';
    }catch(e){
      els.output.innerHTML='<div class="stderr">Failed to load Monaco: '+escapeHtml(String(e&&e.message||e))+'</div>';
      toast('Failed to load editor','error',5000);
    }
  })();
})();
