/* ============================================================
 * Online IDE — Frontend Controller
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- Config & state ---------------- */

  // If the page is served on a different origin than the API, point this
  // at your backend. With the Docker compose setup, frontend and backend
  // share an origin so we can just use a relative path.
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

  // Define a custom dark theme that matches our palette.
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

  /* ---------------- Default template fetch ---------------- */

  async function fetchTemplate() {
    try {
      const r = await fetch(API_BASE + '/api/template');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return j.code || '';
    } catch (e) {
      // Hardcoded fallback so the editor is never empty
      return `#include <bits/stdc++.h>
using namespace std;
int main() {
    cout << "Hello, world!" << endl;
    return 0;
}
`;
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
    `;
    o.appendChild(meta);
  }

  /* ---------------- Run ---------------- */

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
      const j = await r.json();
      const total = +(performance.now() - t0).toFixed(1);

      if (!r.ok) {
        renderOutput({
          success: false,
          stage: 'error',
          stderr: j.error || ('HTTP ' + r.status),
          compile_error: '',
          durationMs: total,
        });
        setNetwork(false);
        toast('Request failed: ' + (j.error || r.status), 'error');
        els.statusMsg.textContent = 'Error';
      } else {
        j.durationMs = j.durationMs ?? total;
        renderOutput(j);
        setNetwork(true);
        if (j.success) {
          els.statusMsg.textContent = 'Run completed';
          toast('Run completed in ' + j.durationMs + ' ms', 'ok', 2000);
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
        stderr: String(e && e.message || e), compile_error: '',
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

    // Wire status bar
    editor.onDidChangeCursorPosition((e) => {
      els.statusCursor.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });
    // Track dirty filename indicator
    editor.onDidChangeModelContent(() => {
      const dirty = editor.getModel().getValue() !== defaultTemplate;
      els.fileName.textContent = dirty ? '● main.cpp' : 'main.cpp';
      els.tabFile.textContent = dirty ? '● main.cpp' : 'main.cpp';
    });

    // Auto-format hint
    setTimeout(() => {
      try { editor.getAction('editor.action.formatDocument').run(); } catch (_) {}
    }, 50);

    // F9 = run, Ctrl/Cmd+Enter = run too
    editor.addCommand(monaco.KeyCode.F9, run);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

    // Allow F9 even when the editor doesn't have focus
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'F9') { ev.preventDefault(); run(); }
    });

    // Top-bar buttons
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

    // Resizable gutter
    setupGutter();

    // Register actions with the guard so the right-click menu can call them.
    if (window.IDE_GUARD) {
      window.IDE_GUARD.setActions({
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
            'Engine: Node.js + g++ 14\n' +
            'Limits: 2s timeout, 256MB RAM, 1MB output\n' +
            '© ' + new Date().getFullYear()
          );
        },
      });
      window.IDE_GUARD.onDevToolsChange((open) => {
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

  /* ---------------- Gutter resize ---------------- */

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
      // Monaco listens to resize via its own observer, but if not:
      if (editor) editor.layout();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.cursor = '';
    });
  }

  /* ---------------- Health ping ---------------- */

  async function ping() {
    try {
      const r = await fetch(API_BASE + '/api/health', { cache: 'no-store' });
      setNetwork(r.ok);
    } catch (_) { setNetwork(false); }
  }

  /* ---------------- Boot ---------------- */

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
