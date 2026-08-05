/* ============================================================
 * Online IDE — Frontend Controller (Cloudflare Pages fix)
 * Fixes:
 * - fetch /api/* uses text() + JSON.parse with try/catch to avoid
 *   "Unexpected end of JSON input" crash on static deploy
 * - Friendly error UI explaining deployment options
 * - Robust against 404 HTML responses from Pages without Functions
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- Config & state ---------------- */

  const API_BASE = (window.IDE_API_BASE || '').replace(/\/+$/, '');

  const els = {
    editor: document.getElementById('editor'),
    runBtn: document.getElementById('runBtn'),
    runLabel: document.getElementById('runLabel'),
    formatBtn: document.getElementById('formatBtn'),
    resetBtn: document.getElementById('resetBtn'),
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
    netDot: document.getElementById('netDot'),
    netLabel: document.getElementById('netLabel'),
    toastHost: document.getElementById('toastHost'),
    gutter: document.getElementById('gutter'),
  };

  let editor = null;
  let defaultTemplate = '';
  let running = false;

  const FALLBACK_TEMPLATE = `#include <bits/stdc++.h>
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

  /* ---------------- Toast helpers ---------------- */

  function toast(message, type = 'info', timeout = 3500) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'error' ? 'error' : type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : '');
    el.textContent = message;
    els.toastHost.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 250);
    }, timeout);
  }

  /* ---------------- Monaco loader ---------------- */

  const THEME = 'ide-dark';
  function defineTheme(monaco) {
    monaco.editor.defineTheme(THEME, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6e7681', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff7b72' },
        { token: 'string', foreground: 'a5d6ff' },
        { token: 'number', foreground: '79c0ff' },
        { token: 'type', foreground: 'ffa657' },
        { token: 'identifier', foreground: 'c9d1d9' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#c9d1d9',
        'editorLineNumber.foreground': '#3a4148',
        'editorLineNumber.activeForeground': '#c9d1d9',
        'editor.lineHighlightBackground': '#161b22',
        'editor.lineHighlightBorder': '#161b22',
        'editorCursor.foreground': '#58a6ff',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#1f3a5a',
        'editorWhitespace.foreground': '#21262d',
        'editorIndentGuide.background': '#21262d',
        'editorIndentGuide.activeBackground': '#30363d',
        'editorBracketMatch.background': '#1f3a5a',
        'editorBracketMatch.border': '#58a6ff',
        'scrollbarSlider.background': '#21262d80',
        'scrollbarSlider.hoverBackground': '#30363d',
        'scrollbarSlider.activeBackground': '#484f58',
      },
    });
  }

  function loadMonaco() {
    if (window.__monacoReady) return window.__monacoReady();
    return new Promise((resolve, reject) => {
      if (!window.require) return reject(new Error('Monaco loader missing'));
      window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
      window.require(['vs/editor/editor.main'], () => resolve(window.monaco), (err) => reject(err));
    });
  }

  /* ---------------- Default template fetch — FIX C ---------------- */

  async function fetchTemplate() {
    try {
      const r = await fetch(API_BASE + '/api/template', { cache: 'no-store' });
      const text = await r.text();
      let j;
      try {
        j = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        console.warn('[ide] /api/template returned non-JSON', parseErr, text.slice(0, 500));
        // Throw to trigger fallback template below
        throw new Error(`API template parse error: ${parseErr.message} | body: ${text.slice(0, 200)}`);
      }
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${j.error || text.slice(0, 200)}`);
      }
      return j.code || j.template || '';
    } catch (e) {
      console.warn('[ide] fetchTemplate fallback used:', e.message);
      // Hardcoded fallback so the editor is never empty
      return FALLBACK_TEMPLATE;
    }
  }

  /* ---------------- Output rendering ---------------- */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderOutput(result) {
    const o = els.output;
    o.innerHTML = '';

    if (!result) {
      o.innerHTML = '<div class="empty">// Run your code to see the output here</div>';
      return;
    }

    if (result.stage === 'compile' || (result.compile_error && result.compile_error.trim())) {
      const h = document.createElement('div');
      h.innerHTML = '<div style="color:#f85149;font-weight:600;margin-bottom:6px;">⛔ Compilation failed</div>';
      const pre = document.createElement('div');
      pre.className = 'stderr';
      pre.textContent = result.compile_error || result.stderr || '(no stderr)';
      h.appendChild(pre);
      o.appendChild(h);
    } else if (result.stage === 'error') {
      // Friendly error UI for deployment issues
      const h = document.createElement('div');
      h.innerHTML = '<div style="color:#f85149;font-weight:600;margin-bottom:8px;">⚠️ Runtime error / API not reachable</div>';
      const pre = document.createElement('div');
      pre.className = 'stderr';
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = result.stderr || result.compile_error || 'Unknown error';
      h.appendChild(pre);

      // Add helpful deployment guide if error looks like static deploy without backend
      const guide = document.createElement('div');
      guide.style.marginTop = '12px';
      guide.style.padding = '10px';
      guide.style.background = '#161b22';
      guide.style.border = '1px solid #30363d';
      guide.style.borderRadius = '6px';
      guide.style.fontSize = '12px';
      guide.style.lineHeight = '1.5';
      guide.innerHTML = `
        <div style="font-weight:600;color:#58a6ff;margin-bottom:6px;">💡 How to fix (Cloudflare Pages deployment):</div>
        <div style="color:#8b949e;">
          1. <b>Recommended:</b> Ensure <code>functions/api/[[path]].js</code> is included in repo.<br>
             Cloudflare Dashboard → Pages → Settings → Functions → should auto-detect.<br>
             Build output directory must be <code>public</code>, build command empty.<br><br>
          2. <b>Piston fallback (no backend needed):</b> The included Pages Function automatically uses
             <a href="https://emkc.org/api/v2/piston" target="_blank" style="color:#58a6ff;">Piston API</a> when <code>BACKEND_URL</code> is not set.<br><br>
          3. <b>Self-hosted Docker backend:</b> Deploy <code>backend/</code> somewhere, then set env var in Cloudflare Pages:<br>
             <code>BACKEND_URL=https://your-backend.com</code><br>
             Pages Function will proxy <code>/api/*</code> to it.
        </div>
      `;
      h.appendChild(guide);

      o.appendChild(h);
    } else {
      const out = result.stdout || '';
      if (out.length) {
        const pre = document.createElement('div');
        pre.textContent = out;
        o.appendChild(pre);
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '// (no stdout)';
        o.appendChild(empty);
      }
      if (result.stderr && result.stderr.trim()) {
        const pre = document.createElement('div');
        pre.className = 'stderr';
        pre.style.marginTop = '10px';
        pre.textContent = '[stderr]\n' + result.stderr;
        o.appendChild(pre);
      }
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    const ok = result.success;
    meta.innerHTML = `
      <span class="${ok ? 'ok' : 'err'}">${ok ? '✓ success' : '✗ failed'}</span>
      <span>stage: ${escapeHtml(result.stage || 'run')}</span>
      <span>time: ${escapeHtml(String(result.durationMs ?? '—'))} ms</span>
      ${result.exit_code != null ? `<span>exit: ${escapeHtml(String(result.exit_code))}</span>` : ''}
      ${result.timed_out ? '<span class="err">timed out (2s)</span>' : ''}
      ${result.signal ? `<span>signal: ${escapeHtml(String(result.signal))}</span>` : ''}
      ${result.mode ? `<span>mode: ${escapeHtml(String(result.mode))}</span>` : ''}
    `;
    o.appendChild(meta);
  }

  /* ---------------- Run — FIX C ---------------- */

  async function run() {
    if (running) return;
    running = true;
    els.runBtn.disabled = true;
    const origLabel = els.runLabel.textContent;
    els.runLabel.innerHTML = '<span class="spinner"></span> Running';
    els.statusMsg.textContent = 'Compiling & running…';
    els.statusTime.textContent = '— ms';
    els.timeChip.textContent = '— ms';

    const code = editor.getValue();
    const stdin = els.stdin.value;
    const t0 = performance.now();

    try {
      const r = await fetch(API_BASE + '/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stdin }),
      });

      const text = await r.text();
      let j;
      try {
        j = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        const total = +(performance.now() - t0).toFixed(1);
        console.error('[ide] /api/run returned non-JSON', parseErr, text.slice(0, 1000));
        renderOutput({
          success: false,
          stage: 'error',
          stderr: `API returned invalid JSON (status ${r.status}). This usually happens when deploying only static files to Cloudflare Pages without Pages Functions.\n\n` +
                  `Raw response (first 1000 chars):\n${text.slice(0, 1000)}\n\n` +
                  `Fix:\n` +
                  `- Ensure functions/api/[[path]].js exists in repo and Cloudflare Pages detects Functions\n` +
                  `- Build output directory = public, Build command = (empty)\n` +
                  `- Optional: Set BACKEND_URL env var to your Node.js backend (https://your-backend.com)\n` +
                  `- Fallback uses Piston API (https://emkc.org) automatically if no backend set\n\n` +
                  `Parse error: ${parseErr.message}`,
          compile_error: '',
          durationMs: total,
          mode: 'parse_error',
        });
        setNetwork(false);
        toast('API returned invalid JSON — check Cloudflare Functions deployment', 'error', 6000);
        els.statusMsg.textContent = 'API error';
        return;
      }

      const total = +(performance.now() - t0).toFixed(1);

      if (!r.ok) {
        renderOutput({
          success: false,
          stage: 'error',
          stderr: j.error || j.stderr || ('HTTP ' + r.status + ': ' + text.slice(0, 500)),
          compile_error: j.compile_error || '',
          durationMs: total,
          mode: j.mode || undefined,
        });
        setNetwork(false);
        toast('Request failed: ' + (j.error || j.stderr || r.status), 'error');
        els.statusMsg.textContent = 'Error';
      } else {
        j.durationMs = j.durationMs ?? total;
        renderOutput(j);
        setNetwork(true);
        if (j.success) {
          els.statusMsg.textContent = 'Run completed' + (j.mode ? ` (${j.mode})` : '');
          toast('Run completed in ' + j.durationMs + ' ms' + (j.mode ? ` [${j.mode}]` : ''), 'ok', 2000);
        } else if (j.timed_out) {
          els.statusMsg.textContent = 'Timed out';
          toast('Execution exceeded 2s timeout', 'warn');
        } else if (j.stage === 'compile') {
          els.statusMsg.textContent = 'Compilation error';
          toast('Compilation error', 'error');
        } else {
          els.statusMsg.textContent = 'Non-zero exit';
          toast('Process exited with code ' + (j.exit_code ?? '?'), 'warn');
        }
        els.statusTime.textContent = j.durationMs + ' ms';
        els.timeChip.textContent = j.durationMs + ' ms';
      }
    } catch (e) {
      setNetwork(false);
      renderOutput({
        success: false, stage: 'error',
        stderr: `Network error: ${String(e && e.message || e)}\n\nPossible causes:\n- Backend not deployed (if using proxy mode, check BACKEND_URL)\n- Cloudflare Pages Function failed to bundle\n- Piston API rate-limited or offline\n\nFix: Check browser console (F12) > Network tab for /api/run request.`,
        compile_error: '',
        durationMs: +(performance.now() - t0).toFixed(1),
      });
      toast('Network error: ' + (e.message || e), 'error');
      els.statusMsg.textContent = 'Offline';
    } finally {
      running = false;
      els.runBtn.disabled = false;
      els.runLabel.textContent = origLabel;
    }
  }

  function setNetwork(ok) {
    els.netDot.style.background = ok ? 'var(--green)' : 'var(--red)';
    els.netDot.style.boxShadow = `0 0 8px ${ok ? 'var(--green)' : 'var(--red)'}`;
    els.netLabel.textContent = ok ? 'Connected' : 'Offline';
  }

  /* ---------------- Editor ---------------- */

  function bindEditor(monaco) {
    defineTheme(monaco);

    editor = monaco.editor.create(els.editor, {
      value: defaultTemplate,
      language: 'cpp',
      theme: THEME,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontLigatures: true,
      fontSize: 14,
      lineHeight: 22,
      minimap: { enabled: true, scale: 1, renderCharacters: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'phase',
      cursorSmoothCaretAnimation: 'on',
      tabSize: 4,
      insertSpaces: true,
      renderWhitespace: 'selection',
      renderLineHighlight: 'all',
      roundedSelection: true,
      padding: { top: 12, bottom: 12 },
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      automaticLayout: true,
      fixedOverflowWidgets: true,
      suggestOnTriggerCharacters: true,
      quickSuggestions: { other: true, comments: false, strings: false },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      'semanticHighlighting.enabled': true,
    });

    editor.onDidChangeCursorPosition((e) => {
      els.statusCursor.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });
    editor.onDidChangeModelContent(() => {
      const dirty = editor.getModel().getValue() !== defaultTemplate;
      els.fileName.textContent = dirty ? '● main.cpp' : 'main.cpp';
      els.tabFile.textContent = dirty ? '● main.cpp' : 'main.cpp';
    });

    setTimeout(() => {
      try { editor.getAction('editor.action.formatDocument').run(); } catch (_) {}
    }, 50);

    editor.addCommand(monaco.KeyCode.F9, run);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'F9') { ev.preventDefault(); run(); }
    });

    els.runBtn.addEventListener('click', run);
    els.resetBtn.addEventListener('click', () => {
      if (editor.getValue() !== defaultTemplate &&
          !confirm('Reset to the default template? Your code will be lost.')) return;
      editor.setValue(defaultTemplate);
      toast('Template restored', 'ok', 1500);
    });
    els.formatBtn.addEventListener('click', () => {
      try { editor.getAction('editor.action.formatDocument').run(); } catch (_) {}
    });
    els.closeTab.addEventListener('click', () => {
      if (!confirm('Clear the editor?')) return;
      editor.setValue('');
    });
    els.clearStdin.addEventListener('click', () => { els.stdin.value = ''; els.stdin.focus(); });
    els.clearOut.addEventListener('click', () => { renderOutput(null); });

    setupGutter();

    const guard = window.IDE_GUARD || window.IDE_SECURITY;
    if (guard) {
      guard.setActions({
        run: () => run(),
        format: () => {
          try { editor.getAction('editor.action.formatDocument').run(); } catch (_) {}
        },
        reset: () => {
          if (editor.getValue() !== defaultTemplate &&
              !confirm('Reset to the default template? Your code will be lost.')) return;
          editor.setValue(defaultTemplate);
          toast('Template restored', 'ok', 1500);
        },
        clearInput: () => { els.stdin.value = ''; els.stdin.focus(); },
        clearOutput: () => renderOutput(null),
        copyOutput: () => {
          const text = els.output.innerText.replace(/\n+$/, '');
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              () => toast('Output copied', 'ok', 1200),
              () => fallbackCopy(text)
            );
          } else {
            fallbackCopy(text);
          }
        },
        about: () => {
          alert(
            'Online IDE — C++\n' +
            'Editor: Monaco 0.45.0\n' +
            'Engine: Node.js + g++ 14 / Piston fallback\n' +
            'Limits: 2s timeout, 256MB RAM, 1MB output\n' +
            '© ' + new Date().getFullYear()
          );
        },
      });
      guard.onDevToolsChange((open) => {
        if (open) {
          setNetwork(false);
          els.statusMsg.textContent = 'DevTools open';
        } else {
          setNetwork(true);
          els.statusMsg.textContent = 'Ready';
        }
      });
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('Output copied', 'ok', 1200);
    } catch (e) {
      toast('Copy failed', 'error', 2000);
    }
  }

  function setupGutter() {
    const workarea = document.querySelector('.workarea');
    let dragging = false;
    els.gutter.addEventListener('mousedown', (e) => {
      dragging = true;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const total = workarea.getBoundingClientRect().width;
      const x = e.clientX - workarea.getBoundingClientRect().left;
      const leftPct = Math.max(0.2, Math.min(0.85, x / total));
      workarea.style.gridTemplateColumns = `${leftPct * 100}% 8px 1fr`;
      if (editor) editor.layout();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.cursor = '';
    });
  }

  async function ping() {
    try {
      const r = await fetch(API_BASE + '/api/health', { cache: 'no-store' });
      const text = await r.text();
      let ok = r.ok;
      try {
        const j = text ? JSON.parse(text) : {};
        ok = ok && (j.ok !== false);
      } catch (_) {
        // If health returns non-JSON, treat as not ok but don't crash
        ok = false;
      }
      setNetwork(ok);
    } catch (_) { setNetwork(false); }
  }

  (async function main() {
    setNetwork(true);
    ping(); setInterval(ping, 15000);

    defaultTemplate = await fetchTemplate();
    try {
      const monaco = await loadMonaco();
      bindEditor(monaco);
      els.statusMsg.textContent = 'Ready';
    } catch (e) {
      els.output.innerHTML =
        '<div class="stderr">Failed to load Monaco Editor: ' +
        escapeHtml(String(e && e.message || e)) +
        '</div>';
      toast('Failed to load editor', 'error', 5000);
    }
  })();
})();
