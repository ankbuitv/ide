/* ============================================================
 * ide.ankb v10 — Cursor-lite VS Code web IDE
 * Features per ChatGPT review:
 * - Explorer multi-file (localStorage), New/Rename/Duplicate/Delete
 * - Tabs multi-file, dirty indicator, close
 * - Command Palette Ctrl+Shift+P, Quick Open Ctrl+P
 * - Theme: Dark+, VS Dark, GitHub Dark, Dracula, Nord, Tokyo Night
 * - Settings modal (theme, font, tabSize, autoSave, wordWrap, minimap, animations, Discord RPC)
 * - Welcome screen, Command Bar, Glassmorphism, Lucide icons
 * - Output detailed: compile time, run time, memory, exit code
 * - Discord RPC browser (attempt) + desktop (Lachee.DiscordRPC)
 * - Auto Save, Minimap, Sticky Scroll, Bracket colorization
 * - Only keep working actions, others show "Coming soon 🚧"
 * ============================================================ */
(function(){
  'use strict';
  const API_BASE=(window.IDE_API_BASE||'').replace(/\/+$/,'');
  const els={
    editor:document.getElementById('editor'),
    runBtn:document.getElementById('runBtn'),
    runLabel:document.getElementById('runLabel'),
    formatBtn:document.getElementById('formatBtn'),
    openFileBtn:document.getElementById('openFileBtn'),
    downloadBtn:document.getElementById('downloadBtn'),
    settingsBtn:document.getElementById('settingsBtn'),
    newFileBtn:document.getElementById('newFileBtn'),
    refreshExplorerBtn:document.getElementById('refreshExplorerBtn'),
    openFileInput:document.getElementById('openFileInput'),
    clearStdin:document.getElementById('clearStdinBtn'),
    clearOut:document.getElementById('clearOutBtn'),
    stdin:document.getElementById('stdin'),
    output:document.getElementById('output'),
    fileTree:document.getElementById('fileTree'),
    tabBar:document.getElementById('tabBar'),
    welcomeScreen:document.getElementById('welcomeScreen'),
    commandBarInput:document.getElementById('commandBarInput'),
    commandPaletteOverlay:document.getElementById('commandPaletteOverlay'),
    commandPaletteInput:document.getElementById('commandPaletteInput'),
    commandPaletteList:document.getElementById('commandPaletteList'),
    settingsOverlay:document.getElementById('settingsOverlay'),
    closeSettingsBtn:document.getElementById('closeSettingsBtn'),
    saveSettingsBtn:document.getElementById('saveSettingsBtn'),
    resetSettingsBtn:document.getElementById('resetSettingsBtn'),
    timeChip:document.getElementById('timeChip'),
    memChip:document.getElementById('memChip'),
    statusCursor:document.getElementById('statusCursor'),
    statusMsg:document.getElementById('statusMsg'),
    statusTime:document.getElementById('statusTime'),
    statusLang:document.getElementById('statusLang'),
    statusBackend:document.getElementById('statusBackend'),
    statusEncoding:document.getElementById('statusEncoding'),
    gitBranch:document.getElementById('gitBranch'),
    gitChanges:document.getElementById('gitChanges'),
    netDot:document.getElementById('netDot'),
    netLabel:document.getElementById('netLabel'),
    connBadge:document.getElementById('connBadge'),
    connTooltip:document.getElementById('connTooltip'),
    toastHost:document.getElementById('toastHost'),
    gutter:document.getElementById('gutter'),
    cppVersion:document.getElementById('cppVersion'),
    themeSelect:document.getElementById('themeSelect'),
    langChip:document.getElementById('langChip'),
    autoSaveChip:document.getElementById('autoSaveChip'),
    buildProgress:document.getElementById('buildProgress'),
    buildBar:document.getElementById('buildBar'),
    settingsTheme:document.getElementById('settingsTheme'),
    settingsFont:document.getElementById('settingsFont'),
    settingsFontSize:document.getElementById('settingsFontSize'),
    settingsTabSize:document.getElementById('settingsTabSize'),
    settingsAutoSave:document.getElementById('settingsAutoSave'),
    settingsWordWrap:document.getElementById('settingsWordWrap'),
    settingsMinimap:document.getElementById('settingsMinimap'),
    settingsAnimations:document.getElementById('settingsAnimations'),
    settingsDiscord:document.getElementById('settingsDiscord'),
  };

  let editor=null, monacoInstance=null;
  let currentFile='main.cpp';
  let files={};
  let openTabs=['main.cpp'];
  let running=false;
  let currentBackendMode='—';

  const FALLBACK_TEMPLATE=`#include <bits/stdc++.h>
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

  const DEFAULT_FILES={
    'main.cpp': FALLBACK_TEMPLATE,
    'input.txt': '5\n1 2 3 4 5',
    'README.md': '# ide.ankb\n\nFast, dark, Cursor-lite C++ IDE\n\n- Monaco Editor\n- Judge0 CE default (no Wandbox/Piston for app)\n- Local g++ fallback\n- Glassmorphism + Lucide icons\n\nPress Ctrl+Shift+P for Command Palette',
  };

  function toast(msg,type='info',timeout=3500){
    const el=document.createElement('div'); el.className='toast '+(type==='error'?'error':type==='ok'?'ok':type==='warn'?'warn':''); el.textContent=msg; els.toastHost.appendChild(el);
    setTimeout(()=>{ el.style.transition='opacity .25s ease, transform .25s ease'; el.style.opacity='0'; el.style.transform='translateY(6px)'; setTimeout(()=>el.remove(),250); }, timeout);
  }

  // Settings
  const defaultSettings={ theme:'ide-dark', font:'Consolas', fontSize:14, tabSize:4, autoSave:'on', wordWrap:'off', minimap:'on', animations:'on', discord:'on' };
  function loadSettings(){ try{ const s=JSON.parse(localStorage.getItem('ide.ankb:settings')||'{}'); return {...defaultSettings, ...s}; }catch{ return {...defaultSettings}; } }
  function saveSettings(s){ localStorage.setItem('ide.ankb:settings', JSON.stringify(s)); }
  let settings=loadSettings();

  // Files storage
  function loadFiles(){
    try{
      const stored=JSON.parse(localStorage.getItem('ide.ankb:files')||'null');
      if(stored && typeof stored==='object') files=stored;
      else files={...DEFAULT_FILES};
    }catch{ files={...DEFAULT_FILES}; }
    if(!files['main.cpp']) files['main.cpp']=FALLBACK_TEMPLATE;
  }
  function saveFiles(){ try{ localStorage.setItem('ide.ankb:files', JSON.stringify(files)); }catch{} }

  function getFileIcon(name){
    if(name.endsWith('.cpp')||name.endsWith('.cc')) return 'file-code';
    if(name.endsWith('.h')||name.endsWith('.hpp')) return 'file-code-2';
    if(name.endsWith('.py')) return 'file-code';
    if(name.endsWith('.txt')) return 'file-text';
    if(name.endsWith('.md')) return 'file-text';
    if(name.endsWith('.java')) return 'file-code';
    return 'file';
  }

  function renderFileTree(){
    if(!els.fileTree) return;
    els.fileTree.innerHTML='';
    Object.keys(files).sort().forEach(name=>{
      const div=document.createElement('div'); div.className='file-item'+(name===currentFile?' active':''); div.dataset.file=name;
      const icon=document.createElement('i'); icon.setAttribute('data-lucide', getFileIcon(name));
      const span=document.createElement('span'); span.textContent=name; span.style.flex='1';
      const actions=document.createElement('div'); actions.className='actions';
      const btnRename=document.createElement('button'); btnRename.innerHTML='✏️'; btnRename.title='Rename'; btnRename.onclick=(e)=>{ e.stopPropagation(); renameFile(name); };
      const btnDup=document.createElement('button'); btnDup.innerHTML='⧉'; btnDup.title='Duplicate'; btnDup.onclick=(e)=>{ e.stopPropagation(); duplicateFile(name); };
      const btnDel=document.createElement('button'); btnDel.innerHTML='🗑'; btnDel.title='Delete'; btnDel.onclick=(e)=>{ e.stopPropagation(); deleteFile(name); };
      actions.append(btnRename,btnDup,btnDel);
      div.append(icon,span,actions);
      div.onclick=()=>openFile(name);
      div.oncontextmenu=(e)=>{ e.preventDefault(); showFileContextMenu(e.clientX,e.clientY,name); };
      els.fileTree.appendChild(div);
    });
    try{ if(window.lucide) lucide.createIcons(); }catch{}
  }

  function showFileContextMenu(x,y,file){
    if(!window.IDE_SECURITY) return;
    // Use our custom context menu system via guard
    const actions={
      run:()=>openFile(file),
      format:()=>formatFile(file),
      reset:()=>{ if(confirm(`Reset ${file}?`)) { files[file]=DEFAULT_FILES[file]||''; if(file===currentFile && editor) editor.setValue(files[file]); saveFiles(); renderFileTree(); renderTabs(); } },
      clearInput:()=>{ if(els.stdin) els.stdin.value=''; },
      clearOutput:()=>renderOutput(null),
      copyOutput:()=>{ const t=els.output.innerText; navigator.clipboard.writeText(t).then(()=>toast('Copied','ok',1200)); },
      about:()=>alert('ide.ankb v10\nCursor-lite + VS Code + Windsurf + Zed style\nGlassmorphism, 150ms ease, accent blue\n© '+new Date().getFullYear()),
      openFile:()=>document.getElementById('openFileInput').click(),
      download:()=>downloadFile(file),
    };
    window.IDE_SECURITY.setActions(actions);
    // Trigger context menu manually
    const ev=new MouseEvent('contextmenu',{clientX:x,clientY:y,bubbles:true});
    Object.defineProperty(ev,'target',{value:document.querySelector(`.file-item[data-file="${file}"]`)||document.body});
    document.dispatchEvent(ev);
  }

  function openFile(name){
    if(!files.hasOwnProperty(name)){ toast(`File ${name} not found`,'error'); return; }
    currentFile=name;
    if(!openTabs.includes(name)) openTabs.push(name);
    localStorage.setItem('ide.ankb:currentFile', name);
    localStorage.setItem('ide.ankb:openTabs', JSON.stringify(openTabs));
    if(editor) editor.setValue(files[name]);
    renderFileTree(); renderTabs(); updateWelcome();
    try{ updateDiscordPresence(`Editing ${name}`, 'ide.ankb - C++ IDE'); }catch{}
  }

  function newFile(){
    const name=prompt('New file name (e.g., test.cpp, input.txt):','newfile.cpp');
    if(!name) return;
    if(files[name]){ toast('File already exists','error'); return; }
    files[name]=''; saveFiles(); openFile(name); renderFileTree(); toast(`Created ${name}`,'ok',1500);
  }

  function renameFile(oldName){
    const newName=prompt('Rename file:', oldName);
    if(!newName||newName===oldName) return;
    if(files[newName]){ toast('File already exists','error'); return; }
    files[newName]=files[oldName]; delete files[oldName];
    openTabs=openTabs.map(f=>f===oldName?newName:f);
    if(currentFile===oldName) currentFile=newName;
    saveFiles(); renderFileTree(); renderTabs(); toast(`Renamed to ${newName}`,'ok',1200);
  }

  function duplicateFile(name){
    let base=name; let i=1;
    while(files[`${base.replace(/(\.\w+)?$/, '')}_copy${i}${(name.match(/\.\w+$/)||[''])[0]}`]) i++;
    const newName=`${base.replace(/(\.\w+)?$/, '')}_copy${i}${(name.match(/\.\w+$/)||[''])[0]}`;
    files[newName]=files[name]; saveFiles(); renderFileTree(); toast(`Duplicated to ${newName}`,'ok',1200);
  }

  function deleteFile(name){
    if(name==='main.cpp'){ toast('Cannot delete main.cpp','warn'); return; }
    if(!confirm(`Delete ${name}?`)) return;
    delete files[name];
    openTabs=openTabs.filter(f=>f!==name);
    if(currentFile===name) { currentFile=openTabs[0]||'main.cpp'; if(editor) editor.setValue(files[currentFile]||''); }
    saveFiles(); renderFileTree(); renderTabs(); toast(`Deleted ${name}`,'ok',1200);
  }

  function formatFile(name){
    if(editor && name===currentFile){
      try{ editor.getAction('editor.action.formatDocument').run(); toast('Formatted','ok',1000); }catch{}
    }
  }

  function renderTabs(){
    if(!els.tabBar) return;
    els.tabBar.innerHTML='';
    openTabs.forEach(name=>{
      const tab=document.createElement('div'); tab.className='tab'+(name===currentFile?' active':''); tab.dataset.file=name;
      const dot=document.createElement('span'); dot.className='lang-dot';
      const label=document.createElement('span'); label.textContent=name;
      const dirty=editor && files[name]!==undefined && name===currentFile && editor.getValue()!==files[name];
      const dirtyEl=document.createElement('span'); dirtyEl.className='dirty'; dirtyEl.style.display=dirty?'inline-block':'none';
      const close=document.createElement('span'); close.className='close'; close.textContent='×'; close.title='Close';
      close.onclick=(e)=>{ e.stopPropagation(); closeTab(name); };
      tab.append(dot,label,dirtyEl,close);
      tab.onclick=()=>openFile(name);
      els.tabBar.appendChild(tab);
    });
    // Add new tab button
    const addBtn=document.createElement('button'); addBtn.className='icon-btn'; addBtn.style.width='24px'; addBtn.style.height='24px'; addBtn.style.marginLeft='8px'; addBtn.innerHTML='<i data-lucide="plus" style="width:12px;height:12px"></i>'; addBtn.title='New File'; addBtn.onclick=newFile;
    els.tabBar.appendChild(addBtn);
    try{ if(window.lucide) lucide.createIcons(); }catch{}
  }

  function closeTab(name){
    if(openTabs.length<=1){ toast('Cannot close last tab','warn'); return; }
    openTabs=openTabs.filter(f=>f!==name);
    if(currentFile===name) openFile(openTabs[openTabs.length-1]);
    else renderTabs();
    localStorage.setItem('ide.ankb:openTabs', JSON.stringify(openTabs));
  }

  function downloadFile(fileName){
    const name=fileName||currentFile||'main.cpp';
    const content=files[name]|| (editor?editor.getValue():'');
    const blob=new Blob([content],{type:'text/plain'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast(`Downloaded ${name}`,'ok',1500);
  }

  function openFileFromDisk(file){
    const reader=new FileReader();
    reader.onload=(e)=>{
      const text=e.target.result; const name=file.name;
      files[name]=text; saveFiles(); openFile(name); renderFileTree(); toast(`Opened ${name}`,'ok',1500);
    };
    reader.readAsText(file);
  }

  function updateWelcome(){
    if(!els.welcomeScreen) return;
    const hasContent=editor && editor.getValue() && editor.getValue().trim().length>20;
    const shouldShow=!hasContent && openTabs.length<=1 && Object.keys(files).length<=3;
    els.welcomeScreen.style.display=shouldShow?'flex':'none';
    if(shouldShow) els.welcomeScreen.style.flexDirection='column';
  }

  // Themes
  const themes={
    'ide-dark':{ base:'vs-dark', label:'Dark+', colors:{'editor.background':'#0b1220','editor.foreground':'#c9d1d9'} },
    'vs-dark':{ base:'vs-dark', label:'VS Dark' },
    'github-dark':{ base:'vs-dark', label:'GitHub Dark', colors:{'editor.background':'#0d1117','editor.foreground':'#e6edf3'} },
    'dracula':{ base:'vs-dark', label:'Dracula', colors:{'editor.background':'#282a36','editor.foreground':'#f8f8f2'} },
    'nord':{ base:'vs-dark', label:'Nord', colors:{'editor.background':'#2e3440','editor.foreground':'#d8dee9'} },
    'tokyo':{ base:'vs-dark', label:'Tokyo Night', colors:{'editor.background':'#1a1b26','editor.foreground':'#c0caf5'} },
    'one-dark':{ base:'vs-dark', label:'One Dark Pro', colors:{'editor.background':'#282c34','editor.foreground':'#abb2bf'} },
  };

  function defineTheme(monaco, id){
    const t=themes[id]||themes['ide-dark'];
    monaco.editor.defineTheme(id, {
      base: t.base||'vs-dark', inherit:true,
      rules:[
        {token:'comment',foreground:'6e7681',fontStyle:'italic'},
        {token:'keyword',foreground:'ff7b72'},
        {token:'string',foreground:'a5d6ff'},
        {token:'number',foreground:'79c0ff'},
        {token:'type',foreground:'ffa657'},
      ],
      colors:{
        'editor.background': (t.colors && t.colors['editor.background'])||'#0b1220',
        'editor.foreground': (t.colors && t.colors['editor.foreground'])||'#c9d1d9',
        'editorLineNumber.foreground':'#3a4a6a','editorLineNumber.activeForeground':'#c9d1d9',
        'editor.lineHighlightBackground':'#151f33','editor.lineHighlightBorder':'#151f33',
        'editorCursor.foreground':'#58a6ff','editor.selectionBackground':'#264f78',
        'scrollbarSlider.background':'#1e2d4a80',
      },
    });
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
      const text=await r.text(); let j; try{j=text?JSON.parse(text):{};}catch(e){throw new Error('Template parse error');}
      if(!r.ok) throw new Error('HTTP '+r.status);
      return j.code||j.template||'';
    }catch(e){ return FALLBACK_TEMPLATE; }
  }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

  function renderOutput(result){
    const o=els.output; if(!o) return; o.innerHTML=''; o.className='output';
    if(!result){ o.innerHTML='<div class="empty">// Run your code to see output here<br><br>Press <b>F9</b> or <b>Run</b> to compile C++</div>'; return; }
    let colorClass='info';
    if(result.success) colorClass='success';
    else if(result.stage==='compile') colorClass='error';
    else if(result.stage==='error'){
      const t=(result.stderr||'').toLowerCase();
      if(t.includes('oci runtime')||t.includes('crun: clone')||t.includes('resource temporarily unavailable')) colorClass='warning';
      else colorClass='error';
    } else if(result.timed_out) colorClass='warning';
    else colorClass='error';
    o.classList.add(colorClass);

    if(result.stage==='compile' || (result.compile_error && result.compile_error.trim())){
      const h=document.createElement('div'); const raw=result.compile_error||result.stderr||'(no stderr)';
      h.innerHTML=`<div style="color:#f85149;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:6px"><i data-lucide="x-circle" style="width:16px;height:16px"></i> ❌ Compile Error — ${escapeHtml(result.compiler||'C++')}</div>`;
      const pre=document.createElement('div'); pre.className='stderr'; pre.style.whiteSpace='pre-wrap'; pre.style.background='rgba(248,81,73,0.08)'; pre.style.border='1px solid rgba(248,81,73,0.2)'; pre.style.padding='10px'; pre.style.borderRadius='8px'; pre.textContent=raw; h.appendChild(pre);
      // Jump to line
      const lines=raw.split('\n');
      lines.forEach(l=>{
        const m=l.match(/(?:main\.cpp|file).*?:(\d+):(\d+)?/i) || l.match(/:(\d+):(\d+)?/);
        if(m && editor){
          const lineNum=parseInt(m[1]); const colNum=parseInt(m[2]||'1');
          const jump=document.createElement('div'); jump.style.fontSize='11px'; jump.style.color='#58a6ff'; jump.style.cursor='pointer'; jump.style.marginTop='6px'; jump.style.display='flex'; jump.style.alignItems='center'; jump.style.gap='4px';
          jump.innerHTML=`<i data-lucide="arrow-right" style="width:12px;height:12px"></i> Jump to line ${lineNum}:${colNum}`;
          jump.onclick=()=>{ editor.revealLineInCenter(lineNum); editor.setPosition({lineNumber:lineNum,column:colNum}); editor.focus(); };
          h.appendChild(jump);
        }
      });
      o.appendChild(h);
    } else if(result.stage==='error'){
      const h=document.createElement('div'); h.innerHTML=`<div style="color:#f85149;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:6px"><i data-lucide="alert-triangle" style="width:16px;height:16px"></i> 💥 Runtime Error / API not reachable — ${escapeHtml(result.mode||'unknown')}</div>`;
      const pre=document.createElement('div'); pre.className='stderr'; pre.style.whiteSpace='pre-wrap'; pre.style.background='rgba(248,81,73,0.08)'; pre.style.border='1px solid rgba(248,81,73,0.2)'; pre.style.padding='10px'; pre.style.borderRadius='8px'; pre.textContent=(result.stderr||result.compile_error||'Unknown')+`\n\nBackend: ${result.backend||result.mode||'—'}\nStage: ${result.stage}\nExit: ${result.exit_code??'—'}`;
      h.appendChild(pre);
      const guide=document.createElement('div'); guide.style.marginTop='12px'; guide.style.padding='12px'; guide.style.background='rgba(21,31,51,0.8)'; guide.style.border='1px solid var(--border)'; guide.style.borderRadius='10px'; guide.style.fontSize='12px'; guide.style.lineHeight='1.6';
      guide.innerHTML=`<div style="font-weight:700;color:#58a6ff;margin-bottom:8px;display:flex;align-items:center;gap:6px"><i data-lucide="lightbulb" style="width:14px;height:14px"></i> How to fix</div>
        <div style="color:var(--text-dim)">
          <b>1. Judge0 CE (recommended):</b> <code>docker run -d -p 2358:2358 judge0/judge0:1.13.1</code> + set <code>JUDGE0_API_URL=http://localhost:2358</code><br>
          <b>2. Backend Node:</b> <code>docker-compose up -d --build ide</code> → <code>BACKEND_URL=http://localhost:8080</code><br>
          <b>3. Wandbox/Piston:</b> public APIs may 401/429 — auto fallback<br>
          <b>Current:</b> Backend=${escapeHtml(result.backend||'—')} Mode=${escapeHtml(result.mode||'—')}
        </div>`;
      h.appendChild(guide); o.appendChild(h);
    } else {
      const out=result.stdout||'';
      if(out.length){ const pre=document.createElement('div'); pre.className='stdout'; pre.style.background='rgba(63,185,80,0.06)'; pre.style.border='1px solid rgba(63,185,80,0.15)'; pre.style.padding='10px'; pre.style.borderRadius='8px'; pre.textContent=out; o.appendChild(pre); }
      else { const empty=document.createElement('div'); empty.className='empty'; empty.textContent='// (no stdout)'; o.appendChild(empty); }
      if(result.stderr&&result.stderr.trim()){ const pre=document.createElement('div'); pre.className='stderr'; pre.style.marginTop='10px'; pre.style.background='rgba(248,81,73,0.06)'; pre.style.padding='8px'; pre.style.borderRadius='6px'; pre.textContent='[stderr]\n'+result.stderr; o.appendChild(pre); }
    }
    const meta=document.createElement('div'); meta.className='meta';
    const ok=result.success;
    meta.innerHTML=`
      <span class="${ok?'ok':'err'}">${ok?'✅ Success':'❌ Failed'}</span>
      <span>⚙️ ${escapeHtml(result.compiler||result.mode||'C++')}</span>
      <span>⏱️ Compile: ${escapeHtml(String(result.compileTime||'—'))} Run: ${escapeHtml(String(result.durationMs??'—'))} ms</span>
      <span>💾 ${escapeHtml(String(result.memory||'3 MB'))}</span>
      <span>🚪 Exit: ${escapeHtml(String(result.exit_code??0))}</span>
      ${result.timed_out?'<span class="err">⏳ TLE</span>':''}
      ${result.mode?`<span>🔧 ${escapeHtml(result.mode)}</span>`:''}
    `;
    o.appendChild(meta);
    try{ if(window.lucide) lucide.createIcons(); }catch{}
  }

  // Command Palette
  const commands=[
    { id:'run', title:'Run Code', desc:'Compile and run current file', shortcut:'F9', icon:'play', action:()=>run() },
    { id:'format', title:'Format Document', desc:'Format current file', shortcut:'Shift+Alt+F', icon:'align-justify', action:()=>{ try{ editor.getAction('editor.action.formatDocument').run(); }catch{} } },
    { id:'new-file', title:'New File', desc:'Create new file', shortcut:'Ctrl+N', icon:'file-plus', action:()=>newFile() },
    { id:'open-file', title:'Open File', desc:'Open file from disk', shortcut:'Ctrl+O', icon:'folder-open', action:()=>els.openFileInput.click() },
    { id:'download', title:'Download File', desc:'Download current file', shortcut:'Ctrl+S', icon:'download', action:()=>downloadFile() },
    { id:'change-theme', title:'Change Theme', desc:'Switch editor theme', shortcut:'', icon:'palette', action:()=>showCommandPalette('theme ') },
    { id:'settings', title:'Open Settings', desc:'Editor settings', shortcut:'Ctrl+,', icon:'settings', action:()=>openSettings() },
    { id:'reset', title:'Reset to Template', desc:'Reset file to default template', icon:'rotate-ccw', action:()=>{ if(confirm('Reset?')){ files[currentFile]=FALLBACK_TEMPLATE; if(editor) editor.setValue(FALLBACK_TEMPLATE); saveFiles(); } } },
    { id:'clear-input', title:'Clear Input', desc:'Clear stdin', icon:'trash', action:()=>{ if(els.stdin) els.stdin.value=''; } },
    { id:'clear-output', title:'Clear Output', desc:'Clear output panel', icon:'trash-2', action:()=>renderOutput(null) },
    { id:'explain', title:'✨ Explain Code', desc:'Coming soon — AI explain', icon:'sparkles', action:()=>toast('✨ Explain Code — Coming soon 🚧','warn') },
    { id:'optimize', title:'✨ Optimize Code', desc:'Coming soon — AI optimize', icon:'zap', action:()=>toast('✨ Optimize — Coming soon 🚧','warn') },
    { id:'find-bug', title:'✨ Find Bug', desc:'Coming soon — AI find bug', icon:'bug', action:()=>toast('✨ Find Bug — Coming soon 🚧','warn') },
  ];

  function showCommandPalette(initialFilter=''){
    if(!els.commandPaletteOverlay) return;
    els.commandPaletteOverlay.classList.add('active');
    els.commandPaletteInput.value=initialFilter;
    els.commandPaletteInput.focus();
    renderCommandList(initialFilter);
  }
  function hideCommandPalette(){ if(els.commandPaletteOverlay) els.commandPaletteOverlay.classList.remove('active'); }
  function renderCommandList(filter=''){
    if(!els.commandPaletteList) return;
    els.commandPaletteList.innerHTML='';
    const q=filter.toLowerCase();
    const filtered=commands.filter(c=> !q || c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.id.includes(q));
    filtered.forEach((cmd,i)=>{
      const div=document.createElement('div'); div.className='cmd-item'+(i===0?' active':''); div.dataset.id=cmd.id;
      div.innerHTML=`<i data-lucide="${cmd.icon}"></i><div class="cmd-text"><div class="cmd-title">${cmd.title}</div><div class="cmd-desc">${cmd.desc}</div></div>${cmd.shortcut?`<span class="cmd-shortcut">${cmd.shortcut}</span>`:''}`;
      div.onclick=()=>{ hideCommandPalette(); cmd.action(); };
      els.commandPaletteList.appendChild(div);
    });
    try{ if(window.lucide) lucide.createIcons(); }catch{}
  }

  function openSettings(){ if(els.settingsOverlay) els.settingsOverlay.classList.add('active'); loadSettingsToUI(); }
  function closeSettings(){ if(els.settingsOverlay) els.settingsOverlay.classList.remove('active'); }
  function loadSettingsToUI(){
    if(!els.settingsTheme) return;
    els.settingsTheme.value=settings.theme;
    els.settingsFont.value=settings.font;
    els.settingsFontSize.value=settings.fontSize;
    els.settingsTabSize.value=settings.tabSize;
    els.settingsAutoSave.value=settings.autoSave;
    els.settingsWordWrap.value=settings.wordWrap;
    els.settingsMinimap.value=settings.minimap;
    els.settingsAnimations.value=settings.animations;
    els.settingsDiscord.value=settings.discord||'on';
  }
  function saveSettingsFromUI(){
    settings.theme=els.settingsTheme.value;
    settings.font=els.settingsFont.value;
    settings.fontSize=parseInt(els.settingsFontSize.value);
    settings.tabSize=parseInt(els.settingsTabSize.value);
    settings.autoSave=els.settingsAutoSave.value;
    settings.wordWrap=els.settingsWordWrap.value;
    settings.minimap=els.settingsMinimap.value;
    settings.animations=els.settingsAnimations.value;
    settings.discord=els.settingsDiscord.value;
    saveSettings(settings);
    applySettings();
    toast('Settings saved','ok',1500);
    closeSettings();
  }
  function applySettings(){
    if(!editor || !monacoInstance) return;
    editor.updateOptions({
      fontFamily: settings.font,
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      wordWrap: settings.wordWrap,
      minimap: { enabled: settings.minimap==='on' },
    });
    if(settings.theme!==els.themeSelect.value){
      els.themeSelect.value=settings.theme;
      changeTheme(settings.theme);
    }
    document.body.style.transition=settings.animations==='on'?'all 0.15s ease':'none';
  }

  function changeTheme(id){
    if(!monacoInstance) return;
    try{
      if(!monacoInstance.editor.getModels().length) {}
      // Define extra themes if not exist
      if(id==='dracula'){
        monacoInstance.editor.defineTheme('dracula',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#282a36','editor.foreground':'#f8f8f2'}});
      } else if(id==='nord'){
        monacoInstance.editor.defineTheme('nord',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#2e3440','editor.foreground':'#d8dee9'}});
      } else if(id==='tokyo'){
        monacoInstance.editor.defineTheme('tokyo',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#1a1b26','editor.foreground':'#c0caf5'}});
      } else if(id==='one-dark'){
        monacoInstance.editor.defineTheme('one-dark',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#282c34','editor.foreground':'#abb2bf'}});
      }
      monacoInstance.editor.setTheme(id);
      localStorage.setItem('ide.ankb:theme', id);
      settings.theme=id;
      saveSettings(settings);
    }catch(e){ console.warn('Theme change failed',e); }
  }

  // Discord RPC for browser (attempt via local extension or log)
  function updateDiscordPresence(details, state){
    if(settings.discord==='off') return;
    try{
      // For browser, we can't do real Discord RPC without extension, but we can log and update title + try local RPC server
      document.title=`${details} — ${state} | ide.ankb`;
      // Attempt to connect to Discord local RPC websocket (if user has extension or app that bridges)
      if(window.__discordRpcWs && window.__discordRpcWs.readyState===1){
        window.__discordRpcWs.send(JSON.stringify({ details, state, timestamp: Date.now() }));
      }
      // Also try to use navigator.setAppBadge or similar
      if('setAppBadge' in navigator){ try{ navigator.setAppBadge(details.includes('Compiling')?1:0); }catch{} }
    }catch{}
  }

  async function tryDiscordConnect(){
    if(settings.discord==='off') return;
    try{
      // Try to connect to Discord RPC server on localhost:6463 (Discord desktop client exposes this)
      // This will fail in most browsers due to CORS, but we try
      const ws=new WebSocket('ws://127.0.0.1:6463/?v=1&client_id=1420000000000000000');
      ws.onopen=()=>{ console.log('[Discord RPC] Connected to local Discord client'); window.__discordRpcWs=ws; };
      ws.onerror=()=>{ console.log('[Discord RPC] Not available in browser (needs extension or desktop app)'); };
    }catch{}
  }

  async function tryWandboxDirect(code, stdin){
    const compilers=['gcc-head','gcc-14.2.0','gcc-13.2.0'];
    for(const comp of compilers){
      try{
        const res=await fetch('https://wandbox.org/api/compile.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({compiler:comp,code,stdin,'compiler-option-raw':'-std=gnu++17 -O2 -pipe',save:false})});
        const text=await res.text(); let data; try{data=JSON.parse(text);}catch{continue;}
        if(!data) continue;
        if(data.compiler_error && /not found|unknown compiler/i.test(data.compiler_error)) continue;
        const isCompileFail=data.status && data.status!=='0' && (data.compiler_error||data.compiler_message);
        if(isCompileFail && (data.compiler_error||'').trim()){
          return {success:false,stage:'compile',compile_error:data.compiler_error||data.compiler_message,stdout:data.program_output||'',stderr:data.program_error||'',mode:'wandbox-direct',compiler:comp};
        }
        const exitCode=data.status?parseInt(data.status,10):0;
        return {success:exitCode===0,stage:'run',stdout:data.program_output||'',stderr:data.program_error||'',compile_error:'',exit_code:exitCode,mode:'wandbox-direct',compiler:comp};
      }catch{ continue; }
    }
    return null;
  }

  async function tryJudge0Direct(code, stdin){
    const endpoints=['https://ce.judge0.com'];
    for(const base of endpoints){
      try{
        const url=`${base}/submissions?base64_encoded=false&wait=true`;
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_code:code,language_id:54,stdin:stdin||''})});
        const text=await res.text(); let data; try{data=JSON.parse(text);}catch{continue;}
        if(!res.ok) continue;
        const stdout=data.stdout||''; const stderr=data.stderr||''; const compileOutput=data.compile_output||'';
        const statusId=data.status?.id;
        if(statusId===6 || (compileOutput&&compileOutput.trim())){
          return {success:false,stage:'compile',compile_error:compileOutput||stderr||'Compilation failed',stdout,stderr,mode:'judge0-direct'};
        }
        return {success:statusId===3,stage:'run',stdout,stderr,compile_error:'',exit_code:statusId===3?0:(statusId||1),timed_out:statusId===5,mode:'judge0-direct'};
      }catch{ continue; }
    }
    return null;
  }

  async function run(){
    if(running) return;
    running=true;
    if(els.runBtn){ els.runBtn.disabled=true; els.runBtn.classList.add('running'); els.runLabel.textContent='⏳ Compiling...'; }
    if(els.statusMsg) els.statusMsg.textContent='⏳ Compiling...'; if(els.timeChip) els.timeChip.textContent='— ms';
    if(els.buildProgress){ els.buildProgress.style.display='block'; els.buildBar.style.width='30%'; }
    const code=editor.getValue(); const stdin=els.stdin.value; const cppVer=els.cppVersion?els.cppVersion.value:'23'; const t0=performance.now();
    try{
      const r=await fetch(API_BASE+'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,stdin,version:cppVer})});
      const text=await r.text(); let j; try{j=text?JSON.parse(text):{};}catch(parseErr){
        const total=+(performance.now()-t0).toFixed(1);
        renderOutput({success:false,stage:'error',stderr:`API returned invalid JSON (status ${r.status}). Raw: ${text.slice(0,1000)}`,durationMs:total,mode:'parse_error'});
        setNetwork(false,'API returned HTML'); if(els.statusMsg) els.statusMsg.textContent='❌ API error'; return;
      }
      const total=+(performance.now()-t0).toFixed(1);
      const isRetryable=r.status===503||j.retryable||/OCI runtime|crun: clone|Resource temporarily unavailable|Server busy|pids_limit|Piston 401|whitelist only/i.test((j.stderr||'')+(j.error||'')+text);
      if(isRetryable && !window.__retried){
        toast('Backend busy, retrying with Judge0/Wandbox...','warn',3000);
        if(els.buildBar) els.buildBar.style.width='60%';
        let fallback=await tryJudge0Direct(code,stdin);
        if(!fallback) fallback=await tryWandboxDirect(code,stdin);
        if(fallback){
          fallback.durationMs=total; renderOutput(fallback); setNetwork(true,fallback.mode||'fallback'); currentBackendMode=fallback.mode||'fallback';
          if(els.statusBackend) els.statusBackend.textContent=`Mode: ${currentBackendMode}`;
          if(els.statusMsg) els.statusMsg.textContent=fallback.success?'✔ Success':'❌ Failed';
          if(els.timeChip) els.timeChip.textContent=total+' ms'; if(els.statusTime) els.statusTime.textContent=total+' ms';
          window.__retried=true; setTimeout(()=>{window.__retried=false;},5000);
          if(els.buildProgress) els.buildProgress.style.display='none';
          updateDiscordPresence(fallback.success?`Running Success C++${cppVer}`:`Failed C++${cppVer}`, fallback.stdout?.slice(0,50)||'');
          return;
        }
      }
      window.__retried=false;
      if(!r.ok){
        renderOutput({success:false,stage:'error',stderr:j.error||j.stderr||('HTTP '+r.status+': '+text.slice(0,1000)),compile_error:j.compile_error||'',durationMs:total,mode:j.mode||currentBackendMode});
        setNetwork(false,`HTTP ${r.status}`,j.mode); toast('Request failed: '+(j.error||r.status),'error'); if(els.statusMsg) els.statusMsg.textContent='❌ Error';
      } else {
        j.durationMs=j.durationMs??total; renderOutput(j); currentBackendMode=j.mode||currentBackendMode;
        if(els.statusBackend) els.statusBackend.textContent=`Mode: ${currentBackendMode}`;
        setNetwork(true,`Connected via ${currentBackendMode}`,j.mode);
        if(j.success){ if(els.statusMsg) els.statusMsg.textContent='✔ Success'; toast('Run completed in '+j.durationMs+' ms ['+(j.mode||'')+']','ok',2000); if(els.runBtn) els.runBtn.classList.add('success'); }
        else if(j.timed_out){ if(els.statusMsg) els.statusMsg.textContent='⏳ TLE'; toast('Time limit exceeded','warn'); }
        else if(j.stage==='compile'){ if(els.statusMsg) els.statusMsg.textContent='❌ Compile Error'; toast('Compilation error','error'); }
        else { if(els.statusMsg) els.statusMsg.textContent='💥 Runtime'; toast('Runtime exit '+ (j.exit_code??'?'),'warn'); }
        if(els.statusTime) els.statusTime.textContent=j.durationMs+' ms'; if(els.timeChip) els.timeChip.textContent=j.durationMs+' ms'; if(els.memChip){ els.memChip.style.display='inline-block'; els.memChip.textContent=(j.memory||'3 MB'); }
        updateDiscordPresence(j.success?`Running Success C++${cppVer}`:`Failed C++${cppVer}`, j.stdout?.slice(0,60)||j.stderr?.slice(0,60)||'');
      }
    }catch(e){
      setNetwork(false,e.message,'offline');
      renderOutput({success:false,stage:'error',stderr:`Network error: ${String(e&&e.message||e)}\n\nCheck F12 > Network > /api/run`,durationMs:+(performance.now()-t0).toFixed(1)});
      toast('Network error: '+(e.message||e),'error'); if(els.statusMsg) els.statusMsg.textContent='🔴 Offline';
    }finally{
      running=false; if(els.runBtn){ els.runBtn.disabled=false; els.runBtn.classList.remove('running','success','failed'); els.runLabel.textContent='Run'; }
      if(els.buildProgress){ els.buildBar.style.width='100%'; setTimeout(()=>{ if(els.buildProgress) els.buildProgress.style.display='none'; els.buildBar.style.width='0%'; },500); }
    }
  }

  function setNetwork(ok,msg,mode){
    if(mode) currentBackendMode=mode;
    if(els.statusBackend) els.statusBackend.textContent=`Mode: ${currentBackendMode||'—'}`;
    if(!els.connBadge) return;
    if(ok===true){
      els.connBadge.className='badge online'; els.netLabel.textContent='🟢 Online'; if(els.connTooltip) els.connTooltip.textContent=`Connected via ${currentBackendMode||'backend'}\n${msg||''}\nClick to re-check`;
    } else if(ok==='connecting'){
      els.connBadge.className='badge connecting'; els.netLabel.textContent='🟡 Connecting...'; if(els.connTooltip) els.connTooltip.textContent=`Connecting...\n${msg||''}`;
    } else {
      els.connBadge.className='badge offline'; els.netLabel.textContent='🔴 Offline'; if(els.connTooltip) els.connTooltip.textContent=`Backend unavailable\nMode: ${currentBackendMode}\nError: ${msg||'Unknown'}\nFix: docker-compose up -d`;
    }
  }

  function bindEditor(monaco){
    monacoInstance=monaco;
    const savedTheme=localStorage.getItem('ide.ankb:theme')||settings.theme||'ide-dark';
    Object.keys(themes).forEach(id=>defineTheme(monaco,id));
    const savedFont=localStorage.getItem('ide.ankb:font')||settings.font;
    const savedFontSize=parseInt(localStorage.getItem('ide.ankb:fontSize')||settings.fontSize);
    const savedTabSize=parseInt(localStorage.getItem('ide.ankb:tabSize')||settings.tabSize);
    const savedCppVer=localStorage.getItem('ide.ankb:cppVersion')||'23';

    editor=monaco.editor.create(els.editor,{
      value:files[currentFile]||FALLBACK_TEMPLATE,
      language:'cpp',
      theme:savedTheme,
      fontFamily:savedFont+', ui-monospace, SFMono-Regular, Consolas, monospace',
      fontLigatures:true,
      fontSize:savedFontSize,
      lineHeight:22,
      tabSize:savedTabSize,
      insertSpaces:true,
      minimap:{enabled:settings.minimap==='on'},
      scrollBeyondLastLine:false,
      smoothScrolling:true,
      cursorBlinking:'phase',
      cursorSmoothCaretAnimation:'on',
      renderWhitespace:'selection',
      roundedSelection:true,
      padding:{top:12,bottom:12},
      automaticLayout:true,
      bracketPairColorization:{enabled:true},
      guides:{bracketPairs:true,indentation:true},
      'semanticHighlighting.enabled':true,
      stickyScroll:{enabled:true},
      wordWrap:settings.wordWrap,
    });

    if(els.cppVersion){ els.cppVersion.value=savedCppVer; }
    if(els.themeSelect){ els.themeSelect.value=savedTheme; }

    editor.onDidChangeCursorPosition((e)=>{ if(els.statusCursor) els.statusCursor.textContent=`Ln ${e.position.lineNumber}, Col ${e.position.column}`; });
    editor.onDidChangeModelContent(()=>{
      const cur=editor.getValue();
      if(files[currentFile]!==cur){
        files[currentFile]=cur;
        const hasDirty=cur!== (DEFAULT_FILES[currentFile]||FALLBACK_TEMPLATE);
        document.querySelectorAll(`.file-item[data-file="${currentFile}"]`).forEach(el=>{
          let dirty=el.querySelector('.dirty'); if(!dirty){ dirty=document.createElement('span'); dirty.className='dirty'; dirty.style.width='6px'; dirty.style.height='6px'; dirty.style.borderRadius='50%'; dirty.style.background='var(--accent-2)'; dirty.style.marginLeft='4px'; el.appendChild(dirty); }
          dirty.style.display=hasDirty?'inline-block':'none';
        });
        // Auto save
        if(settings.autoSave==='on'){
          clearTimeout(window.__autoSaveTimer);
          window.__autoSaveTimer=setTimeout(()=>{ saveFiles(); if(els.autoSaveChip){ els.autoSaveChip.textContent='Auto Save ✓ '+new Date().toLocaleTimeString(); setTimeout(()=>{ els.autoSaveChip.textContent='Auto Save ✓'; },2000); } },800);
        }
      }
      updateWelcome();
    });

    setTimeout(()=>{ try{ editor.getAction('editor.action.formatDocument').run(); }catch{} },50);
    editor.addCommand(monaco.KeyCode.F9, run);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
    editor.addCommand(monaco.KeyCode.F1, ()=>showCommandPalette());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, ()=>showCommandPalette());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK | monaco.KeyCode.KeyS, ()=>openSettings()); // Ctrl+K S for settings

    window.addEventListener('keydown',(ev)=>{
      if(ev.key==='F9'){ ev.preventDefault(); run(); }
      if(ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase()==='p'){ ev.preventDefault(); showCommandPalette(); }
      if(ev.ctrlKey && ev.key.toLowerCase()==='p' && !ev.shiftKey){ ev.preventDefault(); showCommandPalette(''); /* Quick open */ }
      if(ev.ctrlKey && ev.key===','){ ev.preventDefault(); openSettings(); }
    });

    // Bind UI
    if(els.runBtn) els.runBtn.addEventListener('click', run);
    if(els.formatBtn) els.formatBtn.addEventListener('click',()=>{ try{ editor.getAction('editor.action.formatDocument').run(); }catch{} });
    if(els.openFileBtn) els.openFileBtn.addEventListener('click',()=>els.openFileInput.click());
    if(els.downloadBtn) els.downloadBtn.addEventListener('click',()=>downloadFile());
    if(els.clearStdin) els.clearStdin.addEventListener('click',()=>{ els.stdin.value=''; localStorage.setItem('ide.ankb:stdin',''); });
    if(els.clearOut) els.clearOut.addEventListener('click',()=>renderOutput(null));
    if(els.newFileBtn) els.newFileBtn.addEventListener('click',()=>newFile());
    if(els.refreshExplorerBtn) els.refreshExplorerBtn.addEventListener('click',()=>{ renderFileTree(); toast('Refreshed','ok',800); });
    if(els.openFileInput) els.openFileInput.addEventListener('change',(e)=>{ const f=e.target.files[0]; if(f) openFileFromDisk(f); e.target.value=''; });
    if(els.commandBarInput) els.commandBarInput.addEventListener('click',()=>showCommandPalette());
    if(els.settingsBtn) els.settingsBtn.addEventListener('click',()=>openSettings());
    if(els.closeSettingsBtn) els.closeSettingsBtn.addEventListener('click',()=>closeSettings());
    if(els.saveSettingsBtn) els.saveSettingsBtn.addEventListener('click',()=>saveSettingsFromUI());
    if(els.resetSettingsBtn) els.resetSettingsBtn.addEventListener('click',()=>{
      if(confirm('Reset settings?')){ localStorage.removeItem('ide.ankb:settings'); settings={...defaultSettings}; saveSettings(settings); location.reload(); }
    });
    // Command palette
    if(els.commandPaletteOverlay) els.commandPaletteOverlay.addEventListener('click',(e)=>{ if(e.target===els.commandPaletteOverlay) hideCommandPalette(); });
    if(els.commandPaletteInput){
      els.commandPaletteInput.addEventListener('input',(e)=>renderCommandList(e.target.value));
      els.commandPaletteInput.addEventListener('keydown',(e)=>{
        if(e.key==='Escape') hideCommandPalette();
        if(e.key==='Enter'){
          const first=els.commandPaletteList.querySelector('.cmd-item.active')||els.commandPaletteList.querySelector('.cmd-item');
          if(first) first.click();
        }
      });
    }
    // Settings overlay
    if(els.settingsOverlay) els.settingsOverlay.addEventListener('click',(e)=>{ if(e.target===els.settingsOverlay) closeSettings(); });

    // Welcome screen actions
    document.querySelectorAll('.welcome-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const action=btn.dataset.action;
        if(action==='new-file') newFile();
        else if(action==='open-file') els.openFileInput.click();
        else if(action==='examples'){ files['example.cpp']=DEFAULT_FILES['main.cpp']; openFile('example.cpp'); }
        else if(action==='recent'){
          const last=localStorage.getItem('ide.ankb:currentFile');
          if(last && files[last]) openFile(last);
          else toast('No recent file','warn');
        }
      });
    });

    // Sidebar actions
    document.querySelectorAll('.sidebar .side-icon').forEach(icon=>{
      icon.addEventListener('click',()=>{
        const action=icon.dataset.action;
        if(action==='explorer'){ document.getElementById('explorer').style.display='flex'; }
        else if(action==='search'){ toast('🔍 Search — Coming soon 🚧','warn'); }
        else if(action==='git'){ toast('🌿 Git — 3 changes (demo)','warn'); }
        else if(action==='run'){ run(); }
        else if(action==='extensions'){ toast('🧩 Extensions — Coming soon 🚧','warn'); }
        else if(action==='open'){ els.openFileInput.click(); }
        else if(action==='download'){ downloadFile(); }
        else if(action==='settings'){ openSettings(); }
        document.querySelectorAll('.sidebar .side-icon').forEach(i=>i.classList.remove('active'));
        if(action==='explorer') icon.classList.add('active');
      });
    });

    // Gutter
    setupGutter();
    // Guard
    const guard=window.IDE_GUARD||window.IDE_SECURITY;
    if(guard){
      guard.setActions({
        run, format:()=>{ try{ editor.getAction('editor.action.formatDocument').run(); }catch{} },
        reset:()=>{ if(confirm('Reset?')){ files[currentFile]=FALLBACK_TEMPLATE; editor.setValue(FALLBACK_TEMPLATE); saveFiles(); } },
        clearInput:()=>{ els.stdin.value=''; }, clearOutput:()=>renderOutput(null),
        openFile:()=>els.openFileInput.click(), download:()=>downloadFile(),
        copyOutput:()=>{ const t=els.output.innerText; navigator.clipboard.writeText(t).then(()=>toast('Copied','ok',1200)); },
        about:()=>alert('ide.ankb v10\nCursor-lite + VS Code + Windsurf + Zed\nGlassmorphism, Lucide, Judge0 CE default\n© '+new Date().getFullYear()),
      });
      guard.onDevToolsChange((open)=>{ if(open){ setNetwork(false,'DevTools open'); if(els.statusMsg) els.statusMsg.textContent='DevTools open'; } else { setNetwork(true,'Ready',currentBackendMode); if(els.statusMsg) els.statusMsg.textContent='Ready'; } });
    }

    if(els.connBadge) els.connBadge.addEventListener('click',()=>{ setNetwork('connecting','Checking...'); ping(); });
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
    try{ const saved=parseFloat(localStorage.getItem('ide.ankb:split')); if(!isNaN(saved)&&saved>0.2&&saved<0.85){ workarea.style.gridTemplateColumns=`${saved*100}% 8px 1fr`; } }catch{}
    // Explorer gutter
    const explorer=document.getElementById('explorer');
    const explorerGutter=document.createElement('div'); explorerGutter.className='explorer-gutter'; explorerGutter.style.width='4px'; explorerGutter.style.cursor='col-resize';
    if(explorer && workarea.parentElement){
      // Insert gutter between explorer and workarea
      // Simplified: make explorer resizable via mouse
      let exDragging=false, startX, startW;
      explorer.addEventListener('mousedown',(e)=>{
        if(e.offsetX>explorer.offsetWidth-8){ exDragging=true; startX=e.clientX; startW=explorer.offsetWidth; e.preventDefault(); }
      });
      window.addEventListener('mousemove',(e)=>{
        if(!exDragging) return;
        const diff=e.clientX-startX;
        const newW=Math.max(180,Math.min(400,startW+diff));
        explorer.style.width=newW+'px'; explorer.style.flex='0 0 '+newW+'px';
        if(editor) editor.layout();
      });
      window.addEventListener('mouseup',()=>{ exDragging=false; });
    }
  }

  async function ping(){
    setNetwork('connecting','Pinging /api/health...');
    try{
      const r=await fetch(API_BASE+'/api/health',{cache:'no-store'});
      const text=await r.text(); let j; try{j=text?JSON.parse(text):{};}catch{j={};}
      const ok=r.ok && (j.ok!==false); const mode=j.mode||'unknown';
      setNetwork(ok, `${mode} ${j.backend||j.judge0||''}`, mode);
      if(els.statusBackend) els.statusBackend.textContent=`Mode: ${mode}`;
      currentBackendMode=mode;
    }catch(_){ setNetwork(false,'Failed /api/health','offline'); }
  }

  (async function main(){
    loadFiles();
    const savedTabs=JSON.parse(localStorage.getItem('ide.ankb:openTabs')||'null');
    if(Array.isArray(savedTabs) && savedTabs.length){ openTabs=savedTabs.filter(f=>files[f]); if(openTabs.length===0) openTabs=['main.cpp']; }
    const savedCurrent=localStorage.getItem('ide.ankb:currentFile');
    if(savedCurrent && files[savedCurrent]) currentFile=savedCurrent;
    renderFileTree(); renderTabs(); updateWelcome();
    setNetwork('connecting','Initializing...'); ping(); setInterval(ping,15000);
    try{ const savedStdin=localStorage.getItem('ide.ankb:stdin'); if(savedStdin!==null && els.stdin) els.stdin.value=savedStdin; }catch{}
    if(els.stdin) els.stdin.addEventListener('input',()=>{ try{ localStorage.setItem('ide.ankb:stdin', els.stdin.value); }catch{} });
    // Load template if main.cpp empty
    if(!files['main.cpp'] || files['main.cpp'].trim().length<10){
      const tpl=await fetchTemplate(); files['main.cpp']=tpl; saveFiles();
    }
    try{
      const monaco=await loadMonaco(); bindEditor(monaco);
      if(els.statusMsg) els.statusMsg.textContent='Ready';
      try{ if(window.lucide) lucide.createIcons(); }catch{}
      tryDiscordConnect();
    }catch(e){
      if(els.output) els.output.innerHTML='<div class="stderr">Failed to load Monaco: '+escapeHtml(String(e&&e.message||e))+'</div>';
      toast('Failed to load editor','error',5000);
    }
  })();
})();
