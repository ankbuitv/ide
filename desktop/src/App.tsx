import { useState, useCallback, useEffect } from "react";
import Editor from "./components/Editor";
import Terminal from "./components/Terminal";
import Output from "./components/Output";
import StatusBar from "./components/StatusBar";
import Sidebar from "./components/Sidebar";
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

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<CompileResult | null>(null);
  const [running, setRunning] = useState(false);
  const [cppVersion, setCppVersion] = useState("17");
  const [compiler, setCompiler] = useState<"gcc" | "clang" | "msvc">("gcc");
  const [fileName, setFileName] = useState("main.cpp");
  const [activePanel, setActivePanel] = useState<"output" | "terminal">("output");

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    setActivePanel("output");

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
    } finally {
      setRunning(false);
    }
  }, [code, stdin, cppVersion, compiler, running]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F9" || (e.ctrlKey && e.key === "Enter")) {
        e.preventDefault();
        handleRun();
      }
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        // TODO: save file
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleRun]);

  return (
    <div className="app">
      <div className="titlebar">
        <div className="titlebar-title">
          <span className="logo">⚡</span> CP IDE
          <span className="file-name">{fileName}</span>
        </div>
        <div className="titlebar-actions">
          <select
            value={cppVersion}
            onChange={(e) => setCppVersion(e.target.value)}
            className="select-compact"
          >
            <option value="11">C++11</option>
            <option value="14">C++14</option>
            <option value="17">C++17</option>
            <option value="20">C++20</option>
            <option value="23">C++23</option>
          </select>
          <select
            value={compiler}
            onChange={(e) => setCompiler(e.target.value as any)}
            className="select-compact"
          >
            <option value="gcc">GCC</option>
            <option value="clang">Clang</option>
            <option value="msvc">MSVC</option>
          </select>
          <button
            className={`run-btn ${running ? "running" : ""}`}
            onClick={handleRun}
            disabled={running}
          >
            {running ? "⏳ Đang chạy..." : "▶ Chạy (F9)"}
          </button>
        </div>
      </div>

      <div className="main-layout">
        <Sidebar
          fileName={fileName}
          onFileSelect={setFileName}
        />

        <div className="editor-area">
          <Editor
            code={code}
            onChange={setCode}
            language="cpp"
          />
        </div>

        <div className="right-panel">
          <div className="input-section">
            <div className="section-header">
              <span>📥 Input (stdin)</span>
              <button
                className="btn-clear"
                onClick={() => setStdin("")}
              >
                Xóa
              </button>
            </div>
            <textarea
              className="stdin-input"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Nhập input cho chương trình..."
              spellCheck={false}
            />
          </div>

          <div className="panel-tabs">
            <button
              className={`tab ${activePanel === "output" ? "active" : ""}`}
              onClick={() => setActivePanel("output")}
            >
              📤 Output
            </button>
            <button
              className={`tab ${activePanel === "terminal" ? "active" : ""}`}
              onClick={() => setActivePanel("terminal")}
            >
              💻 Terminal
            </button>
            {result && (
              <span className={`tab-badge ${result.success ? "ok" : "err"}`}>
                {result.success ? "✔" : "✘"}
              </span>
            )}
          </div>

          <div className="panel-content">
            {activePanel === "output" && (
              <Output result={result} running={running} />
            )}
            {activePanel === "terminal" && <Terminal />}
          </div>
        </div>
      </div>

      <StatusBar
        result={result}
        running={running}
        cppVersion={cppVersion}
        compiler={compiler}
      />
    </div>
  );
}

export default App;
