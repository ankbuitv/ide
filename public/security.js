/* ============================================================
 * Online IDE — Security (formerly guard.js)
 * ------------------------------------------------------------
 * Deterrent layer against casual inspection:
 *   - Custom right-click context menu
 *   - Blocks common devtools/view-source shortcuts
 *   - DevTools-open detection via dimension polling (size heuristic only)
 *   - Selection/copy disabled on the chrome (not the editor)
 *
 * NOTE: this is a deterrent, not a real security boundary.
 * Anything sent to the browser can be modified by the user.
 *
 * Fixes applied for Cloudflare Pages:
 *   - Renamed from guard.js (blocked by ERR_BLOCKED_BY_CLIENT filters)
 *   - Removed unstable tricks: console.log('%c', new Image()) and debugger;
 *   - Only kept window.outerWidth/innerWidth size heuristic
 *   - Wrapped isDevToolsOpen() in try/catch to avoid spam in Workers env
 * ============================================================ */
(function () {
  'use strict';

  const DEBUG = false; // set true to log guard events to console

  /* ---------------- DevTools-open detection ---------------- */

  let dtWarn = false;          // current state
  let dtBanner = null;         // banner element
  let dtListener = null;       // (state) => void  — set by app.js

  function isDevToolsOpen() {
    try {
      // Only size heuristic — stable across browsers and Cloudflare Workers
      const widthDiff  = (window.outerWidth  || 0) - (window.innerWidth  || 0);
      const heightDiff = (window.outerHeight || 0) - (window.innerHeight || 0);
      // docked thresholds
      if (widthDiff > 160 || heightDiff > 200) return true;
      return false;
    } catch (e) {
      // In case outerWidth/innerWidth not available (e.g., Cloudflare Workers preview)
      if (DEBUG) console.warn('[security] isDevToolsOpen error', e);
      return false;
    }
  }

  function ensureBanner(open) {
    try {
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
        dtBanner.querySelector('#dt-dismiss').addEventListener('click', () => {
          dtBanner.style.display = 'none';
        });
      } else if (!open && dtBanner) {
        dtBanner.style.display = 'none';
      } else if (open && dtBanner) {
        dtBanner.style.display = '';
      }
    } catch (_) {}
  }

  function tick() {
    try {
      const open = isDevToolsOpen();
      if (open !== dtWarn) {
        dtWarn = open;
        ensureBanner(open);
        try { if (dtListener) dtListener(open); } catch (_) {}
        if (DEBUG) console.log('[security] devtools =', open);
      }
    } catch (e) {
      if (DEBUG) console.warn('[security] tick error', e);
    }
  }

  /* ---------------- Keyboard blocker ---------------- */

  const BLOCKED = [
    { key: 'F12' },
    { key: 'u', ctrl: true, shift: false, alt: false, meta: false },
    { key: 'i', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 'j', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 'c', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 'k', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 's', ctrl: true, shift: false, alt: false, meta: false },
    { key: 'p', ctrl: true, shift: false, alt: false, meta: false },
    { key: 'a', ctrl: true, shift: false, alt: false, meta: false },
    { key: 's', ctrl: true, shift: true,  alt: false, meta: false },
    { key: 'F7' },
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
      return true;
    }
    return false;
  }

  function onKeydown(ev) {
    if (blocked(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (DEBUG) console.log('[security] blocked key', ev.key);
      return false;
    }
  }

  /* ---------------- Custom context menu ---------------- */

  let menuEl = null;
  let menuActions = null;
  let currentTarget = null;

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
    ev.preventDefault();
    ev.stopPropagation();
    openMenu(ev.clientX, ev.clientY, ev.target);
    return false;
  }

  /* ---------------- Public API ---------------- */

  // Keep both names for backward compat
  const API = {
    setActions(actions) { menuActions = actions; },
    onDevToolsChange(fn) { dtListener = fn; },
    closeMenu,
    isDevToolsOpen() { return dtWarn; },
  };
  window.IDE_GUARD = API;
  window.IDE_SECURITY = API;

  /* ---------------- Wire up ---------------- */

  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('click', (ev) => {
    if (menuEl && !menuEl.contains(ev.target)) closeMenu();
  }, true);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

  setInterval(tick, 800);
  tick();
})();
