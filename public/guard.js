/* ============================================================
 * Online IDE — Guard
 * ------------------------------------------------------------
 * Deterrent layer against casual inspection:
 *   - Custom right-click context menu
 *   - Blocks common devtools/view-source shortcuts
 *   - DevTools-open detection via dimension polling
 *   - Selection/copy disabled on the chrome (not the editor)
 *
 * NOTE: this is a deterrent, not a real security boundary.
 * Anything sent to the browser can be modified by the user.
 * ============================================================ */
(function () {
  'use strict';

  const DEBUG = false; // set true to log guard events to console

  /* ---------------- DevTools-open detection ---------------- */

  let dtWarn = false;          // current state
  let dtBanner = null;         // banner element
  let dtListener = null;       // (state) => void  — set by app.js

  function isDevToolsOpen() {
    // 1) Window-size heuristic — works on desktop browsers
    const widthDiff  = (window.outerWidth  || 0) - (window.innerWidth  || 0);
    const heightDiff = (window.outerHeight || 0) - (window.innerHeight || 0);
    // docked thresholds
    if (widthDiff > 160 || heightDiff > 200) return true;
    // 2) console.log detection — works once
    try {
      const before = new Date();
      // eslint-disable-next-line no-console
      console.log('%c', new Image());
      const after = new Date();
      if (after - before > 60) return true; // toString trick stalls when devtools is open
    } catch (_) {}
    // 3) debugger trap — pauses the page when devtools is open
    try {
      const t = new Date();
      // eslint-disable-next-line no-debugger
      debugger;
      if (new Date() - t > 100) return true;
    } catch (_) {}
    return false;
  }

  function ensureBanner(open) {
    if (open && !dtBanner) {
      dtBanner = document.createElement('div');
      dtBanner.id = 'dt-warning';
      dtBanner.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9"  x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span><b>DevTools detected.</b> Please close it to avoid losing your work.</span>
        <button id="dt-dismiss" type="button">Dismiss</button>
      `;
      document.body.appendChild(dtBanner);
      // dismiss just hides the banner; if devtools is still open it re-appears next tick
      dtBanner.querySelector('#dt-dismiss').addEventListener('click', () => {
        dtBanner.style.display = 'none';
      });
    } else if (!open && dtBanner) {
      dtBanner.style.display = 'none';
    } else if (open && dtBanner) {
      dtBanner.style.display = '';
    }
  }

  function tick() {
    const open = isDevToolsOpen();
    if (open !== dtWarn) {
      dtWarn = open;
      ensureBanner(open);
      try { if (dtListener) dtListener(open); } catch (_) {}
      if (DEBUG) console.log('[guard] devtools =', open);
    }
  }

  /* ---------------- Keyboard blocker ---------------- */

  // We block these on the whole document EXCEPT inside Monaco (Monaco
  // already eats most of them). We allow F9 (run) and Ctrl/Cmd+Enter (run).
  const BLOCKED = [
    // F12
    { key: 'F12' },
    // View source
    { key: 'u', ctrl: true, shift: false, alt: false, meta: false },
    // DevTools toggles
    { key: 'i', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 'j', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 'c', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 'k', ctrl: true, shift: true,  alt: false, meta: false }, // Firefox
    { key: 's', ctrl: true, shift: false, alt: false, meta: false },
    { key: 'p', ctrl: true, shift: false, alt: false, meta: false },
    { key: 'a', ctrl: true, shift: false, alt: false, meta: false },
    { key: 's', ctrl: true, shift: true,  alt: false, meta: false }, // save-as on some browsers
    { key: 'F7' }, // Firefox caret browsing
    // Print
    { key: 'p', ctrl: true, shift: false, alt: false, meta: false },
  ];

  function isEditable(t) {
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || t.isContentEditable;
  }

  function blocked(ev) {
    for (const b of BLOCKED) {
      if (b.key.toLowerCase() !== ev.key.toLowerCase()) continue;
      if (b.ctrl   !== undefined && b.ctrl   !== ev.ctrlKey)   continue;
      if (b.shift  !== undefined && b.shift  !== ev.shiftKey)  continue;
      if (b.alt    !== undefined && b.alt    !== ev.altKey)    continue;
      if (b.meta   !== undefined && b.meta   !== ev.metaKey)   continue;
      // No modifier specified means "any" — already matched by exact key.
      return true;
    }
    return false;
  }

  function onKeydown(ev) {
    if (blocked(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (DEBUG) console.log('[guard] blocked key', ev.key);
      return false;
    }
  }

  /* ---------------- Custom context menu ---------------- */

  let menuEl = null;
  let menuActions = null;     // {run, format, reset, clearInput, clearOutput, copyOutput, about}
  let currentTarget = null;   // the element under the cursor when opened

  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  function position(x, y) {
    if (!menuEl) return;
    const w = menuEl.offsetWidth;
    const h = menuEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x + w > vw - 4) x = vw - w - 4;
    if (y + h > vh - 4) y = vh - h - 4;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    menuEl.style.left = x + 'px';
    menuEl.style.top  = y + 'px';
  }

  function buildItem(label, opts = {}) {
    const li = document.createElement('li');
    li.className = 'ctx-item' + (opts.disabled ? ' disabled' : '') + (opts.danger ? ' danger' : '') + (opts.header ? ' header' : '');
    if (opts.header) {
      li.textContent = label;
      return li;
    }
    if (opts.icon) {
      const ico = document.createElement('span');
      ico.className = 'ctx-ico';
      ico.innerHTML = opts.icon;
      li.appendChild(ico);
    }
    const txt = document.createElement('span');
    txt.className = 'ctx-text';
    txt.textContent = label;
    li.appendChild(txt);
    if (opts.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'ctx-sc';
      sc.textContent = opts.shortcut;
      li.appendChild(sc);
    }
    if (!opts.disabled && !opts.header) {
      li.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeMenu();
        try { opts.onClick(currentTarget, ev); } catch (e) { if (DEBUG) console.error(e); }
      });
    }
    return li;
  }

  function openMenu(x, y, target) {
    closeMenu();
    currentTarget = target;

    menuEl = document.createElement('div');
    menuEl.id = 'ctx-menu';
    menuEl.setAttribute('role', 'menu');

    const ul = document.createElement('ul');

    // Header showing where the user clicked
    const where = (() => {
      const t = target;
      if (!t) return 'Workspace';
      if (t.closest && t.closest('.editor-pane')) return 'Editor';
      if (t.closest && t.closest('.editor-host')) return 'Editor';
      if (t.closest && t.closest('.right-pane')) {
        if (t.closest && t.closest('#stdin')) return 'Input (stdin)';
        if (t.closest && t.closest('#output')) return 'Output';
        return 'Panel';
      }
      if (t.closest && t.closest('.topbar')) return 'Top Bar';
      if (t.closest && t.closest('.statusbar')) return 'Status Bar';
      return 'Workspace';
    })();
    ul.appendChild(buildItem(`Context · ${where}`, { header: true }));

    ul.appendChild(buildItem('Run', {
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>',
      shortcut: 'F9',
      onClick: () => menuActions && menuActions.run && menuActions.run(),
    }));
    ul.appendChild(buildItem('Format Document', {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/><path d="m14 14 5 5"/><path d="m19 14-5 5"/></svg>',
      shortcut: '⇧⌘F',
      onClick: () => menuActions && menuActions.format && menuActions.format(),
    }));
    ul.appendChild(buildItem('Reset to Template', {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
      danger: true,
      onClick: () => menuActions && menuActions.reset && menuActions.reset(),
    }));

    ul.appendChild(sep());

    ul.appendChild(buildItem('Clear Input (stdin)', {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
      onClick: () => menuActions && menuActions.clearInput && menuActions.clearInput(),
    }));
    ul.appendChild(buildItem('Clear Output', {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      onClick: () => menuActions && menuActions.clearOutput && menuActions.clearOutput(),
    }));
    ul.appendChild(buildItem('Copy Output', {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      shortcut: '⌘C',
      onClick: () => menuActions && menuActions.copyOutput && menuActions.copyOutput(),
    }));

    ul.appendChild(sep());

    ul.appendChild(buildItem('Reload Page', {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
      shortcut: 'F5',
      onClick: () => location.reload(),
    }));
    ul.appendChild(buildItem('About Online IDE', {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
      onClick: () => menuActions && menuActions.about && menuActions.about(),
    }));

    menuEl.appendChild(ul);
    document.body.appendChild(menuEl);
    position(x, y);

    // focus the first item for keyboard nav
    requestAnimationFrame(() => {
      const first = menuEl.querySelector('li.ctx-item:not(.header):not(.disabled)');
      if (first) first.focus();
    });
  }

  function sep() {
    const li = document.createElement('li');
    li.className = 'ctx-sep';
    li.setAttribute('role', 'separator');
    return li;
  }

  function onContextMenu(ev) {
    // Always suppress the browser default and show our menu.
    ev.preventDefault();
    ev.stopPropagation();
    openMenu(ev.clientX, ev.clientY, ev.target);
    return false;
  }

  /* ---------------- Public API ---------------- */

  window.IDE_GUARD = {
    /**
     * Register actions so the context menu can invoke them.
     */
    setActions(actions) {
      menuActions = actions;
    },
    /**
     * Subscribe to devtools state changes.
     */
    onDevToolsChange(fn) { dtListener = fn; },
    /**
     * Programmatically close the menu.
     */
    closeMenu,
    /**
     * Whether devtools is currently believed to be open.
     */
    isDevToolsOpen() { return dtWarn; },
  };

  /* ---------------- Wire up ---------------- */

  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('click', (ev) => {
    if (menuEl && !menuEl.contains(ev.target)) closeMenu();
  }, true);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

  // Devtools polling — every 800ms is a good balance between detection
  // speed and CPU usage. The banner stays in place once shown until either
  // devtools closes or the user dismisses it.
  setInterval(tick, 800);
  tick();
})();
