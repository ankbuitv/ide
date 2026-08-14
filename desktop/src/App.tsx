import { useState, useCallback, useEffect, useRef } from "react";
import Editor from "./components/Editor";
import Output from "./components/Output";
import { compile, type CompileResult, type CompileOptions } from "./lib/tauri";
import "./styles/App.css";

const DEFAULT_CODE = `#include <bits/stdc++.h>
using namespace std;

#define fors(i, a, b) for (int i = a; i < b; i++)
#define ll long long

void sub() {
    ios_base::sync_with_stdio(false);
    cin.tie(0); cout.tie(0);
}

void sol() {
    cout << "Hello world!" << endl;
}

int main() {
    sub();
    sol();
    return 0;
}
`;

type RunState = "idle" | "running" | "success" | "failed";

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<CompileResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [cppVersion, setCppVersion] = useState("17");
  const [compiler, setCompiler] = useState<"gcc" | "clang" | "msvc">("gcc");
  const [fileName] = useState("main.cpp");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [statusMsg, setStatusMsg] = useState("Ready");
  const runStateTimer = useRef<number | null>(null);

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setRunState("running");
    setResult(null);
    setStatusMsg("Compiling & running…");
    if (runStateTimer.current) window.clearTimeout(runStateTimer.current);

    const opts: CompileOptions = {
      code,
      stdin,
      cppVersion,
      compiler,
      flags: "-O2 -pipe",
    };

    try {
      const res = await compile(opts);
      setResult(res);
      setRunState(res.success ? "success" : "failed");
      setStatusMsg(res.success ? "Build succeeded" : "Build failed");
    } catch (err: any) {
      setResult({
        success: false,
        stage: "error",
        stdout: "",
        stderr: `Lỗi: ${err?.message || String(err)}`,
        compile_error: "",
        duration_ms: 0,
        exit_code: -1,
        timed_out: false,
      });
      setRunState("failed");
      setStatusMsg("Error");
    } finally {
      setRunning(false);
      runStateTimer.current = window.setTimeout(() => setRunState("idle"), 2200);
    }
  }, [code, stdin, cppVersion, compiler, running]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F9" || (e.ctrlKey && e.key === "Enter")) {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleRun]);

  const runBtnClass =
    runState === "running"
      ? "run-btn running"
      : runState === "success"
        ? "run-btn success"
        : runState === "failed"
          ? "run-btn failed"
          : "run-btn";

  return (
    <div className="app">
      {/* ===== Activity bar (left icon rail) ===== */}
      <nav className="side-rail no-select" aria-label="Activity Bar">
        <div className="side-icon active" title="Explorer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
        </div>
        <div className="side-icon" title="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        </div>
        <div className="side-icon" title="Source Control">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M6 9v6" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
        </div>
        <div className="side-icon" title="Run and Debug" onClick={handleRun}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="6 3 20 12 6 21 6 3" /></svg>
        </div>
        <div className="spacer" />
        <div className="side-icon" title="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
      </nav>

      {/* ===== Top bar ===== */}
      <header className="topbar no-select">
        <div className="brand">
          <span className="logo-glyph">⚡</span>
          <span className="brand-text">CP IDE</span>
        </div>
        <div className="menu-bar">
          <div className="menu-item">File</div>
          <div className="menu-item">Edit</div>
          <div className="menu-item">View</div>
          <div className="menu-item" onClick={handleRun}>Run</div>
          <div className="menu-item">Help</div>
        </div>
        <div className="crumbs" aria-hidden="true">
          <span>workspace</span>
          <span className="sep">/</span>
          <span className="file">{fileName}</span>
        </div>

        <div className="spacer" />

        <div className="select-wrap" title="C++ standard">
          <select value={cppVersion} onChange={(e) => setCppVersion(e.target.value)}>
            <option value="23">C++23</option>
            <option value="20">C++20</option>
            <option value="17">C++17</option>
            <option value="14">C++14</option>
            <option value="11">C++11</option>
          </select>
        </div>
        <div className="select-wrap" title="Compiler">
          <select value={compiler} onChange={(e) => setCompiler(e.target.value as any)}>
            <option value="gcc">GCC</option>
            <option value="clang">Clang</option>
            <option value="msvc">MSVC</option>
          </select>
        </div>

        <div className="badge online" title="Native compiler — runs offline">
          <span className="dot" />
          <span>Native</span>
        </div>

        <button className={runBtnClass} onClick={handleRun} disabled={running} title="Run (F9)">
          {running ? (
            <span className="spinner" />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z" /></svg>
          )}
          <span>{running ? "Running…" : "Run"}</span>
          <span className="key">F9</span>
        </button>
      </header>

      {/* ===== Tab bar ===== */}
      <div className="tabbar no-select" role="tablist">
        <div className="tab" role="tab">
          <span className="lang-dot" />
          <span>{fileName}</span>
        </div>
        <div className="tab-actions">
          <span className="chip">C++{cppVersion}</span>
          <span className="chip">{compiler.toUpperCase()}</span>
        </div>
      </div>

      {/* ===== Work area ===== */}
      <main className="workarea">
        <section className="editor-pane" aria-label="Code editor">
          <div className="editor-host">
            <Editor
              code={code}
              onChange={setCode}
              language="cpp"
              onCursorChange={(line, col) => setCursor({ line, col })}
            />
          </div>
        </section>
        <div className="gutter" role="separator" aria-orientation="vertical" />
        <aside className="right-pane" aria-label="Input and Output">
          <div className="pane-head">
            <span className="pane-title">Input (stdin)</span>
            <span className="actions">
              <button className="icon-btn" title="Clear input" onClick={() => setStdin("")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </button>
            </span>
          </div>
          <div className="pane-body">
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              spellCheck={false}
              placeholder={"5\n1 2 3 4 5"}
            />
          </div>
          <div className="pane-head">
            <span className="pane-title">Output</span>
            <span className="actions">
              <span className="chip">{result ? `${result.duration_ms?.toFixed(0)} ms` : "— ms"}</span>
              <button className="icon-btn" title="Clear output" onClick={() => setResult(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </button>
            </span>
          </div>
          <div className="pane-body">
            <Output result={result} running={running} />
          </div>
        </aside>
      </main>

      {/* ===== Status bar ===== */}
      <footer className="statusbar no-select">
        <span className="seg accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></svg>
          <span>C++{cppVersion}</span>
        </span>
        <span className="seg">Ln {cursor.line}, Col {cursor.col}</span>
        <span className="seg">UTF-8</span>
        <span className="seg">Spaces: 4</span>
        {running && (
          <div className="build-progress"><div className="bar" /></div>
        )}
        <div className="right">
          <span className="seg" title="Compiler">{result?.compiler_used || compiler.toUpperCase()}</span>
          <span className={`seg ${runState === "failed" ? "err" : runState === "success" ? "ok" : ""}`}>{statusMsg}</span>
          <span className="seg">{result ? `${result.duration_ms?.toFixed(1)} ms` : "— ms"}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
