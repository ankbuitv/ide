/* ============================================================
 * ide.ankb — Security (formerly guard.js)
 * - Allows Ctrl+A/C/V/X/Z/Y/A for editor (IDE requirement)
 * - Blocks only devtools shortcuts: F12, Ctrl+Shift+I/J/C/K, Ctrl+U, F7
 * - DevTools detection via size heuristic only, wrapped in try/catch
 * ============================================================ */
(function () {
  'use strict';
  const DEBUG = false;
  let dtWarn = false, dtBanner = null, dtListener = null;

  function isDevToolsOpen() {
    try {
      const w = (window.outerWidth||0)-(window.innerWidth||0);
      const h = (window.outerHeight||0)-(window.innerHeight||0);
      if (w>160||h>200) return true;
      return false;
    } catch(e){ return false; }
  }
  function ensureBanner(open){
    try{
      if(open&&!dtBanner){
        dtBanner=document.createElement('div'); dtBanner.id='dt-warning';
        dtBanner.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span><b>DevTools detected.</b> ide.ankb will still work, but please close it.</span><button id="dt-dismiss" type="button">Dismiss</button>`;
        document.body.appendChild(dtBanner);
        dtBanner.querySelector('#dt-dismiss').addEventListener('click',()=>{dtBanner.style.display='none';});
      } else if(!open&&dtBanner){ dtBanner.style.display='none'; }
      else if(open&&dtBanner){ dtBanner.style.display=''; }
    }catch(_){}
  }
  function tick(){
    try{
      const open=isDevToolsOpen();
      if(open!==dtWarn){ dtWarn=open; ensureBanner(open); try{if(dtListener) dtListener(open);}catch(_){} if(DEBUG) console.log('[security] devtools',open); }
    }catch(e){}
  }

  // Only block devtools/view-source, allow Ctrl+A/C/V/X/Z/Y for IDE
  const BLOCKED = [
    { key: 'F12' },
    { key: 'u', ctrl: true, shift: false, alt: false, meta: false }, // Ctrl+U view source
    { key: 'i', ctrl: true, shift: true }, // Ctrl+Shift+I
    { key: 'j', ctrl: true, shift: true }, // Ctrl+Shift+J
    { key: 'c', ctrl: true, shift: true }, // Ctrl+Shift+C inspect
    { key: 'k', ctrl: true, shift: true }, // Firefox
    { key: 'F7' },
  ];

  function isInEditorOrEditable(t){
    if(!t) return false;
    // If inside Monaco editor or input/textarea, allow all editing shortcuts
    if(t.closest && (t.closest('.monaco-editor') || t.closest('.editor-host') || t.closest('#editor'))) return true;
    const tag=(t.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||t.isContentEditable) return true;
    return false;
  }

  function blocked(ev){
    // Always allow Ctrl+A/C/V/X/Z/Y/A in editor / inputs — essential for IDE
    if(ev.ctrlKey || ev.metaKey){
      const k=ev.key.toLowerCase();
      if(['a','c','v','x','z','y'].includes(k)){
        // If inside editor or editable, allow
        if(isInEditorOrEditable(ev.target)) return false;
        // Even outside, allow select all / copy for usability
        if(k==='a' || k==='c') return false;
      }
    }

    for(const b of BLOCKED){
      if(b.key.toLowerCase()!==ev.key.toLowerCase()) continue;
      if(b.ctrl!==undefined && b.ctrl!==ev.ctrlKey) continue;
      if(b.shift!==undefined && b.shift!==ev.shiftKey) continue;
      if(b.alt!==undefined && b.alt!==ev.altKey) continue;
      if(b.meta!==undefined && b.meta!==ev.metaKey) continue;
      return true;
    }
    return false;
  }

  function onKeydown(ev){
    if(blocked(ev)){
      ev.preventDefault(); ev.stopPropagation();
      if(DEBUG) console.log('[security] blocked',ev.key);
      return false;
    }
  }

  // Context menu
  let menuEl=null, menuActions=null, currentTarget=null;
  function closeMenu(){ if(menuEl){ menuEl.remove(); menuEl=null; } }
  function position(x,y){
    if(!menuEl) return;
    const w=menuEl.offsetWidth, h=menuEl.offsetHeight, vw=window.innerWidth, vh=window.innerHeight;
    if(x+w>vw-4) x=vw-w-4; if(y+h>vh-4) y=vh-h-4; if(x<4)x=4; if(y<4)y=4;
    menuEl.style.left=x+'px'; menuEl.style.top=y+'px';
  }
  function buildItem(label, opts={}){
    const li=document.createElement('li');
    li.className='ctx-item'+(opts.disabled?' disabled':'')+(opts.danger?' danger':'')+(opts.header?' header':'');
    if(opts.header){ li.textContent=label; return li; }
    if(opts.icon){ const ico=document.createElement('span'); ico.className='ctx-ico'; ico.innerHTML=opts.icon; li.appendChild(ico); }
    const txt=document.createElement('span'); txt.className='ctx-text'; txt.textContent=label; li.appendChild(txt);
    if(opts.shortcut){ const sc=document.createElement('span'); sc.className='ctx-sc'; sc.textContent=opts.shortcut; li.appendChild(sc); }
    if(!opts.disabled&&!opts.header){ li.addEventListener('click',(ev)=>{ ev.stopPropagation(); closeMenu(); try{ opts.onClick(currentTarget,ev); }catch(e){ if(DEBUG) console.error(e);} }); }
    return li;
  }
  function openMenu(x,y,target){
    closeMenu(); currentTarget=target;
    menuEl=document.createElement('div'); menuEl.id='ctx-menu'; menuEl.setAttribute('role','menu');
    const ul=document.createElement('ul');
    const where=(()=>{ const t=target; if(!t) return 'Workspace'; if(t.closest&&t.closest('.editor-pane')) return 'Editor'; if(t.closest&&t.closest('.editor-host')) return 'Editor'; if(t.closest&&t.closest('.right-pane')){ if(t.closest&&t.closest('#stdin')) return 'Input'; if(t.closest&&t.closest('#output')) return 'Output'; return 'Panel'; } if(t.closest&&t.closest('.sidebar')) return 'Sidebar'; if(t.closest&&t.closest('.topbar')) return 'Top Bar'; return 'Workspace'; })();
    ul.appendChild(buildItem(`Context · ${where}`,{header:true}));
    ul.appendChild(buildItem('🟢 Run',{icon:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>',shortcut:'F9',onClick:()=>menuActions&&menuActions.run&&menuActions.run()}));
    ul.appendChild(buildItem('Format Document',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/></svg>',shortcut:'⇧⌘F',onClick:()=>menuActions&&menuActions.format&&menuActions.format()}));
    ul.appendChild(buildItem('Reset to Template',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',danger:true,onClick:()=>menuActions&&menuActions.reset&&menuActions.reset()}));
    ul.appendChild(sep());
    ul.appendChild(buildItem('Open File...',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',onClick:()=>menuActions&&menuActions.openFile&&menuActions.openFile()}));
    ul.appendChild(buildItem('Download File',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',onClick:()=>menuActions&&menuActions.download&&menuActions.download()}));
    ul.appendChild(sep());
    ul.appendChild(buildItem('Clear Input',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',onClick:()=>menuActions&&menuActions.clearInput&&menuActions.clearInput()}));
    ul.appendChild(buildItem('Clear Output',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',onClick:()=>menuActions&&menuActions.clearOutput&&menuActions.clearOutput()}));
    ul.appendChild(buildItem('Copy Output',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',shortcut:'⌘C',onClick:()=>menuActions&&menuActions.copyOutput&&menuActions.copyOutput()}));
    ul.appendChild(sep());
    ul.appendChild(buildItem('Reload',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',onClick:()=>location.reload()}));
    ul.appendChild(buildItem('About ide.ankb',{icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',onClick:()=>menuActions&&menuActions.about&&menuActions.about()}));
    menuEl.appendChild(ul); document.body.appendChild(menuEl); position(x,y);
    requestAnimationFrame(()=>{ const first=menuEl.querySelector('li.ctx-item:not(.header):not(.disabled)'); if(first) first.focus(); });
  }
  function sep(){ const li=document.createElement('li'); li.className='ctx-sep'; li.setAttribute('role','separator'); return li; }
  function onContextMenu(ev){ ev.preventDefault(); ev.stopPropagation(); openMenu(ev.clientX,ev.clientY,ev.target); return false; }

  const API={ setActions(a){ menuActions=a; }, onDevToolsChange(fn){ dtListener=fn; }, closeMenu, isDevToolsOpen(){ return dtWarn; } };
  window.IDE_GUARD=API; window.IDE_SECURITY=API;

  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('click',(ev)=>{ if(menuEl&&!menuEl.contains(ev.target)) closeMenu(); }, true);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  setInterval(tick, 800); tick();
})();
