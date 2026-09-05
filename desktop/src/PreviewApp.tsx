import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import Editor from "./components/Editor";
import { runJudge0 } from "./lib/judge0";
import { fetchOjSnapshot, loadOjConnections, OJ_DEFINITIONS, saveOjConnections, type OjConnection, type OjId, type OjSnapshot } from "./lib/oj";
import "./styles/Preview.css";

type Channel = "standard" | "beta" | "nightly";
type Modal = "workspace" | "templates" | "settings" | "search" | null;

type IconName =
  | "grid"
  | "files"
  | "search"
  | "flask"
  | "chart"
  | "history"
  | "cloud"
  | "settings"
  | "spark"
  | "play"
  | "plus"
  | "chevron"
  | "check"
  | "clock"
  | "memory"
  | "bug"
  | "terminal"
  | "close"
  | "arrow";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    files: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    flask: <><path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3" /><path d="M7.5 16h9" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 3-4 3 2 5-7" /><circle cx="18" cy="6" r="1" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></>,
    cloud: <><path d="M7 18a5 5 0 1 1 1.8-9.7A6 6 0 0 1 20 11a3.5 3.5 0 0 1-1 7H7Z" /><path d="M12 12v6m-2-2 2 2 2-2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.7-1.7.1-.1A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.5-1H6.7v-2.4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h2.4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>,
    spark: <><path d="m12 3-1.4 5.6L5 10l5.6 1.4L12 17l1.4-5.6L19 10l-5.6-1.4L12 3Z" /><path d="m19 16-.7 2.3L16 19l2.3.7L19 22l.7-2.3L22 19l-2.3-.7L19 16Z" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    memory: <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
    bug: <><path d="M9 8a3 3 0 0 1 6 0v1a4 4 0 0 1 2 3.5V15a5 5 0 0 1-10 0v-2.5A4 4 0 0 1 9 9V8Z" /><path d="M12 3v2M5 10H2m20 0h-3M6 6 4 4m14 2 2-2M6 16l-3 1m15-1 3 1" /></>,
    terminal: <><path d="m5 7 5 5-5 5M12 17h7" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    arrow: <><path d="M5 12h13M13 6l6 6-6 6" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const templateCode = [
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "#define fw(i, a, b) for (int i = a; i < b; i++)",
  "#define rt(i, a, b) for (int i = a; i > b; i--)",
  "#define ll long long",
  "",
  "void sub() {",
  "    ios_base::sync_with_stdio(false);",
  "    cin.tie(nullptr);",
  "}",
  "",
  "void sol() {",
  '    cout << "Hell yeah!";',
  "}",
  "",
  "",
  "int main() {",
  "    sub();",
  "    sol();",
  "    return 0;",
  "}",
];

const templateSource = `${templateCode.join("\n")}\n`;
const templateOptions = [
  { name: "C++17 · Competitive starter", description: "fw / rt macros · fast io · Hell yeah!", code: templateSource },
  { name: "Empty C++17 file", description: "A clean main function", code: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n" },
  { name: "Fast input and output", description: "A minimal stdin / stdout scaffold", code: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    return 0;\n}\n" },
];

const navItems: { id: string; label: string; icon: IconName; count?: string }[] = [
  { id: "overview", label: "Workspace", icon: "grid" },
  { id: "editor", label: "Editor", icon: "files" },
  { id: "problems", label: "Problems", icon: "flask" },
  { id: "benchmarks", label: "Benchmarks", icon: "chart" },
  { id: "history", label: "Local history", icon: "history" },
];

function highlightLine(line: string): ReactNode[] {
  const regex = /(\/\/.*|"[^"\\]*(?:\\.[^"\\]*)*"|#\w+|\b(?:using|namespace|void|int|return|long|double|for|const|auto|include)\b|\b(?:sub|sol|main|cout|cin|ios_base|sync_with_stdio|nullptr)\b|\b\d+(?:\.\d+)?\b)/g;
  return line.split(regex).map((part, index) => {
    if (part.startsWith("//")) return <span className="syntax-comment" key={index}>{part}</span>;
    if (part.startsWith('"')) return <span className="syntax-string" key={index}>{part}</span>;
    if (part.startsWith("#")) return <span className="syntax-preproc" key={index}>{part}</span>;
    if (/^(using|namespace|void|int|return|long|double|for|const|auto|include)$/.test(part)) return <span className="syntax-keyword" key={index}>{part}</span>;
    if (/^(sub|sol|main|cout|cin|ios_base|sync_with_stdio|nullptr)$/.test(part)) return <span className="syntax-function" key={index}>{part}</span>;
    if (/^\d/.test(part)) return <span className="syntax-number" key={index}>{part}</span>;
    return <span key={index}>{part}</span>;
  });
}

interface FullScreenEditorProps {
  code: string;
  saved: boolean;
  running: boolean;
  runPassed: boolean;
  stdin: string;
  outputText: string;
  runDuration: number | null;
  runMemory: number | null;
  channel: Channel;
  editorRef: MutableRefObject<any>;
  onChange: (value: string) => void;
  onStdinChange: (value: string) => void;
  onClearOutput: () => void;
  onExit: () => void;
  onRun: () => void;
  onSave: () => void;
  onSettings: () => void;
  onToggleComments: () => void;
  showToast: (message: string) => void;
}

function FullScreenEditor({ code, saved, running, runPassed, stdin, outputText, runDuration, runMemory, channel, editorRef, onChange, onStdinChange, onClearOutput, onExit, onRun, onSave, onSettings, onToggleComments, showToast }: FullScreenEditorProps) {
  const outputIsEmpty = !outputText || outputText.startsWith("// Run your code") || outputText.startsWith("// Sending code");
  const outputClass = running ? "info" : runDuration !== null ? runPassed ? "success" : "error" : "";

  return (
    <div className="app legacy-editor-preview">
      <nav className="side-rail no-select" aria-label="Activity Bar">
        <button className="side-icon" title="Back to Workspace (Esc)" onClick={onExit}><Icon name="arrow" size={18} /></button>
        <div className="side-icon active" title="Editor"><Icon name="files" size={18} /></div>
        <div className="spacer" />
        <button className="side-icon" title="Save (Ctrl+S)" onClick={onSave}><Icon name="cloud" size={18} /></button>
        <button className="side-icon" title="Settings" onClick={onSettings}><Icon name="settings" size={18} /></button>
      </nav>

      <header className="topbar no-select">
        <div className="brand">
          <button className="legacy-back-button" title="Back to Workspace" onClick={onExit}>‹</button>
          <img className="logo-img" src="/logo.png" alt="ide.ankb" width="28" height="28" />
          <span className="brand-text">ide.ankb</span>
        </div>
        <div className="menu-bar">
          <button className="menu-item" onClick={onSave}>File</button>
          <button className="menu-item" onClick={onToggleComments}>Edit</button>
          <button className="menu-item" onClick={onSettings}>View</button>
          <button className="menu-item" onClick={onRun}>Run</button>
        </div>
        <div className="crumbs"><span>workspace</span><span className="sep">/</span><span className="file">{saved ? "" : "● "}main.cpp</span></div>
        <div className="spacer" />
        <div className="select-wrap" title="Language"><span>C++17</span></div>
        <div className="badge online" title="Online execution engine"><span className="dot" /><span>Judge0 CE</span></div>
        <button className={`run-btn ${running ? "running" : runPassed && runDuration !== null ? "success" : ""}`} onClick={onRun} disabled={running}>
          {running ? <span className="spinner" /> : <Icon name="play" size={12} />}
          <span>{running ? "Running…" : "Run"}</span><span className="key">F9</span>
        </button>
      </header>

      <div className="tabbar">
        <div className="tab active"><span className="lang-dot" /><span className="tab-name">{saved ? "" : "● "}main.cpp</span><button className="close" title="Back to Workspace" onClick={onExit}>×</button></div>
        <button className="tab-add no-select" title="New source file" onClick={() => { onChange(""); showToast("New source file created"); }}>+</button>
        <div className="tab-actions no-select"><span className="chip">C++17</span><span className="chip">UTF-8</span><span className="chip">{channel === "nightly" ? "Nightly" : channel === "beta" ? "Beta" : "Standard"}</span></div>
      </div>

      <main className="workarea">
        <section className="editor-pane" aria-label="Code editor">
          <div className="editor-host">
            <Editor key="legacy-style-editor" path="/preview/main.cpp" code={code} onChange={onChange} language="cpp" fontSize={15} minimap onMountRef={(editor) => { editorRef.current = editor; }} />
          </div>
        </section>
        <div className="gutter" role="separator" aria-orientation="vertical" />
        <aside className="right-pane" aria-label="Input and Output">
          <div className="pane-head"><span className="pane-title">Input (stdin)</span><span className="actions"><button className="icon-btn" title="Clear input" onClick={() => onStdinChange("")}><Icon name="close" size={13} /></button></span></div>
          <div className="pane-body"><textarea value={stdin} onChange={(event) => onStdinChange(event.target.value)} spellCheck={false} placeholder="Input for your program…" /></div>
          <div className="pane-head"><span className="pane-title">Output</span><span className="actions"><span className={running ? "accent" : runPassed && runDuration !== null ? "ok" : ""}>{running ? "Running…" : runPassed && runDuration !== null ? "Passed" : "Ready"}</span><button className="icon-btn" title="Clear output" onClick={onClearOutput}><Icon name="close" size={13} /></button></span></div>
          <div className="pane-body"><div className={`output ${outputClass} output-pane`}>
            {running ? <div className="output-loading"><span className="spinner dark" /><span>Compiling &amp; running…</span></div> : outputIsEmpty ? <div className="empty">{outputText}</div> : <pre className={runPassed ? "stdout" : "stderr"}>{outputText}</pre>}
            {!running && runDuration !== null && <div className="meta"><span className={runPassed ? "ok" : "err"}>{runPassed ? "✓ Success" : "✗ Failed"}</span><span>⏱ {runDuration.toFixed(1)} ms</span>{runMemory !== null && <span>RAM {Math.round(runMemory)} KB</span>}</div>}
          </div></div>
        </aside>
      </main>

      <footer className="statusbar">
        <div className="seg"><span className={running ? "accent" : runPassed && runDuration !== null ? "ok" : ""}>{running ? "⏳ Running…" : runPassed && runDuration !== null ? "✔ Passed" : "⚡ Ready"}</span></div>
        <div className="seg accent">Ctrl+/ Toggle comment</div>
        <div className="right"><span>C++17</span><span>Ln 13, Col 5</span><span>{saved ? "Saved" : "Unsaved"}</span></div>
      </footer>
    </div>
  );
}
const OJ_IDS: OjId[] = ["codeforces", "vnoj", "tbcpc"];

function formatMetric(value: number | undefined, suffix = ""): string {
  return value === undefined ? "—" : `${value.toLocaleString()}${suffix}`;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatSubmissionDate(value: number | undefined): string {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value * 1000));
}

function PreviewApp() {
  const [activeNav, setActiveNav] = useState("overview");
  const [channel, setChannel] = useState<Channel>("standard");
  const [running, setRunning] = useState(false);
  const [runPassed, setRunPassed] = useState(false);
  const [saved, setSaved] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [connections, setConnections] = useState<OjConnection[]>(() => loadOjConnections());
  const [snapshots, setSnapshots] = useState<Partial<Record<OjId, OjSnapshot>>>({});
  const [ojLoading, setOjLoading] = useState<Partial<Record<OjId, boolean>>>({});
  const [ojErrors, setOjErrors] = useState<Partial<Record<OjId, string>>>({});
  const [handleInputs, setHandleInputs] = useState<Record<OjId, string>>({ codeforces: "", vnoj: "", tbcpc: "" });
  const ojRequestRef = useRef<Partial<Record<OjId, string>>>({});
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState({ formatOnSave: true, autoSave: true });
  const [now, setNow] = useState(() => new Date());
  const isDesktop = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  const availableChannels: Channel[] = isDesktop ? ["standard", "beta", "nightly"] : ["standard"];
  const [focusMode, setFocusMode] = useState(false);
  const [code, setCode] = useState(() => {
    try { return window.localStorage.getItem("ide.ankb.current-source") || templateSource; } catch { return templateSource; }
  });
  const [stdin, setStdin] = useState("");
  const [outputText, setOutputText] = useState("// Run your code to see output");
  const [runDuration, setRunDuration] = useState<number | null>(null);
  const [runMemory, setRunMemory] = useState<number | null>(null);
  const editorRef = useRef<any>(null);

  const channelInfo = useMemo(() => ({
    standard: { label: "Standard", sub: "Stable channel", className: "standard", color: "#62e6a4" },
    beta: { label: "Beta", sub: "Early access", className: "beta", color: "#f7c86a" },
    nightly: { label: "Nightly", sub: "VIP Pro lab", className: "nightly", color: "#c29bff" },
  }[channel]), [channel]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!settings.autoSave) return;
    try { window.localStorage.setItem("ide.ankb.current-source", code); } catch { /* local storage may be disabled */ }
  }, [settings.autoSave, code]);

  useEffect(() => {
    setHandleInputs((current) => {
      const next = { ...current };
      for (const connection of connections) next[connection.oj] = connection.handle;
      return next;
    });
  }, [connections]);

  const refreshOj = useCallback(async (connection: OjConnection): Promise<OjSnapshot> => {
    const requestId = `${Date.now()}-${Math.random()}`;
    ojRequestRef.current[connection.oj] = requestId;
    setOjLoading((current) => ({ ...current, [connection.oj]: true }));
    setOjErrors((current) => {
      const next = { ...current };
      delete next[connection.oj];
      return next;
    });
    try {
      const snapshot = await fetchOjSnapshot(connection);
      if (ojRequestRef.current[connection.oj] === requestId) setSnapshots((current) => ({ ...current, [connection.oj]: snapshot }));
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load this judge";
      if (ojRequestRef.current[connection.oj] === requestId) {
        setSnapshots((current) => {
          const next = { ...current };
          delete next[connection.oj];
          return next;
        });
        setOjErrors((current) => ({ ...current, [connection.oj]: message }));
      }
      throw error;
    } finally {
      if (ojRequestRef.current[connection.oj] === requestId) setOjLoading((current) => ({ ...current, [connection.oj]: false }));
    }
  }, []);

  useEffect(() => {
    for (const connection of connections) void refreshOj(connection);
  }, [connections, refreshOj]);

  const connectOj = useCallback(async (oj: OjId) => {
    const handle = handleInputs[oj].trim();
    if (!handle) {
      setOjErrors((current) => ({ ...current, [oj]: "Enter a handle first" }));
      return;
    }
    const connection = { oj, handle } satisfies OjConnection;
    try {
      const snapshot = await refreshOj(connection);
      const next = [...connections.filter((item) => item.oj !== oj), connection];
      setConnections(next);
      saveOjConnections(next);
      setSnapshots((current) => ({ ...current, [oj]: snapshot }));
      showToast(`${OJ_DEFINITIONS[oj].name} connected · data refreshed`);
    } catch {
      showToast(`${OJ_DEFINITIONS[oj].name} could not be connected`);
    }
  }, [connections, handleInputs, refreshOj, showToast]);

  const disconnectOj = useCallback((oj: OjId) => {
    ojRequestRef.current[oj] = `disconnected-${Date.now()}`;
    const next = connections.filter((item) => item.oj !== oj);
    setConnections(next);
    saveOjConnections(next);
    setSnapshots((current) => {
      const copy = { ...current };
      delete copy[oj];
      return copy;
    });
    setOjErrors((current) => {
      const copy = { ...current };
      delete copy[oj];
      return copy;
    });
    setHandleInputs((current) => ({ ...current, [oj]: "" }));
    showToast(`${OJ_DEFINITIONS[oj].name} disconnected`);
  }, [connections, showToast]);

  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const currentDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  const dashboardSnapshot = snapshots.codeforces ?? snapshots.vnoj ?? snapshots.tbcpc;
  const recentSubmissions = useMemo(() => Object.values(snapshots).flatMap((snapshot) => snapshot?.submissions ?? []).sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0)).slice(0, 3), [snapshots]);

  const saveSource = useCallback(() => {
    const source = settings.formatOnSave ? code.split("\n").map((line) => line.trimEnd()).join("\n") : code;
    if (source !== code) setCode(source);
    try { window.localStorage.setItem("ide.ankb.current-source", source); } catch { /* local storage may be disabled */ }
    setSaved(true);
    showToast("main.cpp saved locally");
  }, [code, settings.formatOnSave, showToast]);

  const enterEditor = useCallback((newFile = false) => {
    if (newFile) {
      setCode(templateSource);
      setSaved(false);
      showToast("New file created · editor focus mode");
    }
    setFocusMode(true);
  }, [showToast]);

  const toggleComments = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model) return;

    const selections = editor.getSelections?.() ?? [];
    const lines = new Set<number>();
    for (const selection of selections) {
      for (let line = selection.startLineNumber; line <= selection.endLineNumber; line += 1) {
        lines.add(line);
      }
    }
    if (!lines.size) {
      const position = editor.getPosition?.();
      if (position) lines.add(position.lineNumber);
    }

    const lineNumbers = [...lines].sort((a, b) => a - b);
    const contents = lineNumbers.map((lineNumber) => model.getLineContent(lineNumber));
    const nonEmpty = contents.filter((line) => line.trim().length > 0);
    const removeComment = nonEmpty.length > 0 && nonEmpty.every((line) => /^\s*\/\/(?:\s|$)/.test(line));
    const edits = lineNumbers.map((lineNumber) => {
      const line = model.getLineContent(lineNumber);
      if (!line.trim()) return null;
      const indent = line.match(/^\s*/)?.[0] ?? "";
      const body = line.slice(indent.length);
      const updated = removeComment
        ? line.replace(/^(\s*)\/\/ ?/, "$1")
        : `${indent}// ${body}`;
      return {
        range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
        text: updated,
        forceMoveMarkers: true,
      };
    }).filter(Boolean);

    if (edits.length) {
      editor.executeEdits("toggle-line-comment", edits);
      editor.focus();
      setSaved(false);
      showToast(removeComment ? "Comment removed · Ctrl+/" : "Line commented · Ctrl+/ ");
    }
  }, [showToast]);

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "/" || event.code === "Slash")) {
        event.preventDefault();
        event.stopPropagation();
        toggleComments();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setFocusMode(false);
        showToast("Returned to workspace overview");
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [focusMode, showToast, toggleComments]);

  const runCode = async () => {
    if (running) return;
    setRunning(true);
    setRunPassed(false);
    setRunDuration(null);
    setRunMemory(null);
    setOutputText("// Sending code to Judge0…");
    showToast("Compiling main.cpp · Time limit 1.0s");

    try {
      const result = await runJudge0(code, stdin, "17");
      const output = result.stdout || result.stderr || result.compile_error || "// (no output)";
      setOutputText(output);
      setRunDuration(result.duration_ms ?? null);
      setRunMemory(result.memory_kb ?? null);
      setRunPassed(result.success);
      showToast(result.success ? `All tests passed · ${result.duration_ms.toFixed(0)} ms` : "Run failed · inspect the output panel");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutputText(`Judge0 unavailable: ${message}`);
      setRunPassed(false);
      showToast("Không kết nối được Judge0 · thử lại sau");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!focusMode) return;
    const onEditorShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveSource();
      } else if (event.key === "F9" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
        event.preventDefault();
        runCode();
      }
    };
    window.addEventListener("keydown", onEditorShortcut, true);
    return () => window.removeEventListener("keydown", onEditorShortcut, true);
  }, [focusMode, running, runCode, saveSource]);

  const changeChannel = (next: Channel) => {
    setChannel(next);
    const message = next === "standard"
      ? "Standard channel selected · stable and recommended"
      : next === "beta"
        ? "Beta channel selected · experimental features enabled"
        : "Nightly channel selected · VIP Pro lab unlocked";
    showToast(message);
  };

  const openNav = (id: string, label: string) => {
    setActiveNav(id);
    showToast(`${label} view selected`);
  };

  if (focusMode) {
    return (
      <div className={`preview-shell channel-${channel}`}>
        <div className="aurora aurora-one" />
        <div className="aurora aurora-two" />
        <div className="noise" />
        <FullScreenEditor
          code={code}
          saved={saved}
          running={running}
          runPassed={runPassed}
          stdin={stdin}
          outputText={outputText}
          runDuration={runDuration}
          runMemory={runMemory}
          channel={channel}
          editorRef={editorRef}
          onChange={(value) => { setCode(value); setSaved(false); }}
          onStdinChange={(value) => { setStdin(value); }}
          onClearOutput={() => { setOutputText(""); setRunDuration(null); setRunMemory(null); setRunPassed(false); }}
          onExit={() => { setFocusMode(false); showToast("Returned to workspace overview"); }}
          onRun={runCode}
          onSave={saveSource}
          onSettings={() => { setFocusMode(false); setModal("settings"); }}
          onToggleComments={toggleComments}
          showToast={showToast}
        />
      </div>
    );
  }

  return (
    <div className={`preview-shell channel-${channel}`}>
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <div className="noise" />

      <aside className="preview-rail">
        <div className="rail-logo" title="ide.ankb">
          <img src="/logo.png" alt="ide.ankb" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          <span>&lt;/&gt;</span>
        </div>
        <div className="rail-divider" />
        <div className="rail-links">
          {[
            ["overview", "grid", "Workspace"],
            ["editor", "files", "Editor"],
            ["search", "search", "Search"],
            ["problems", "flask", "Problems"],
            ["benchmarks", "chart", "Benchmarks"],
          ].map(([id, icon, label]) => (
            <button
              className={`rail-button ${activeNav === id ? "active" : ""}`}
              key={id}
              title={label}
              onClick={() => { if (id === "editor") enterEditor(); else if (id === "search") { setActiveNav(id); setModal("search"); } else openNav(id, label); }}
            >
              <Icon name={icon as IconName} size={18} />
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <button className="rail-button" title="Settings" onClick={() => setModal("settings")}><Icon name="settings" size={18} /></button>
          <div className="avatar avatar-small">AB</div>
        </div>
      </aside>

      <div className="preview-main">
        <header className="preview-topbar">
          <div className="topbar-path"><span className="path-dot" />Workspace <span>/</span> <strong>cp-starter</strong></div>
          <button className="command-search" onClick={() => setModal("search")}>
            <Icon name="search" size={14} /><span>Search anything</span><kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <button className="icon-ghost" title="Online judge data sources" onClick={() => setAccountOpen(true)}><Icon name="cloud" size={16} /></button>
            <div className="online-state"><span /> Workspace ready</div>
            <button className="account-trigger" onClick={() => setAccountOpen(true)} title="Online judge accounts">
              <div className={`avatar ${connections.length ? "avatar-purple" : "avatar-cyan"}`}>{connections.length ? connections.length : "OJ"}</div>
              <span><strong>{connections.length ? `${connections.length} OJ connected` : "No OJ connected"}</strong><small>{connections.length ? "Data is live" : "Connect a handle"}</small></span>
            </button>
            <button className="icon-ghost" title="Settings" onClick={() => setModal("settings")}><Icon name="settings" size={16} /></button>
          </div>
        </header>

        <div className="preview-layout">
          <aside className="preview-sidebar">
            <div className="sidebar-topline"><span>IDE workspace</span><button onClick={() => setModal("workspace")} title="New workspace"><Icon name="plus" size={14} /></button></div>
            <div className="nav-list">
              {navItems.map((item) => (
                <button className={`nav-item ${activeNav === item.id ? "active" : ""}`} key={item.id} onClick={() => openNav(item.id, item.label)}>
                  <Icon name={item.icon} size={15} /><span>{item.label}</span>{item.count && <em>{item.count}</em>}
                </button>
              ))}
            </div>
            <div className="sidebar-label">PROJECT</div>
            <div className="project-card">
              <div className="project-icon"><Icon name="files" size={16} /></div>
              <div><strong>cp-starter</strong><small>~/projects/contests</small></div>
              <span className="project-status" />
            </div>
            <div className="tree">
              <div className="tree-row folder-open"><span>⌄</span><span className="folder-glyph">◆</span><strong>src</strong></div>
              <button className="tree-row file-active" onClick={() => enterEditor()}><span className="tree-indent" /><span className="file-glyph">C++</span><strong>main.cpp</strong><span className="dirty-dot" /></button>
            </div>
            <div className="sidebar-bottom-card" onClick={() => setModal("templates")}>
              <div className="sparkle-box"><Icon name="spark" size={15} /></div>
              <div><strong>Template library</strong><small>Starter templates</small></div>
              <Icon name="arrow" size={14} />
            </div>
          </aside>

          <main className="preview-content">
            <div className="content-heading">
              <div>
                <div className="eyebrow"><span className="live-pill"><i /> CURRENT SESSION</span><span>{currentDate}</span></div>
                <h1>{greeting}.</h1>
                <p>{connections.length ? "Your online-judge data is ready." : "Connect an online judge to see your real statistics."}</p>
                {toast && <div className="inline-status" role="status">{toast}</div>}
              </div>
              <div className="heading-actions">
                <button className="recent-edit-button" onClick={() => { enterEditor(); showToast("Editing recent file · main.cpp"); }}><Icon name="history" size={15} /><span><strong>Edit recent</strong><small>main.cpp</small></span><Icon name="arrow" size={13} /></button>
                <button className="secondary-button" onClick={() => setModal("workspace")}><Icon name="plus" size={15} /> New workspace</button>
                <button className="primary-button" onClick={() => enterEditor(true)}><Icon name="files" size={15} /> New file</button>
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat-card stat-green"><div className="stat-icon"><Icon name="check" size={16} /></div><div><small>Problems solved</small><strong>{formatMetric(dashboardSnapshot?.solved)}</strong><span className="stat-source">{dashboardSnapshot ? dashboardSnapshot.oj === "codeforces" ? "From latest fetched submissions" : dashboardSnapshot.source : "Connect an OJ account"}</span></div></div>
              <div className="stat-card stat-purple"><div className="stat-icon"><Icon name="chart" size={16} /></div><div><small>Submissions</small><strong>{formatMetric(dashboardSnapshot?.submissionCount)}</strong><span className="stat-source">{dashboardSnapshot?.submissionLabel ?? "No data"}</span></div></div>
              <div className="stat-card stat-amber"><div className="stat-icon"><Icon name="flask" size={16} /></div><div><small>Rating</small><strong>{formatMetric(dashboardSnapshot?.rating)}</strong><span className="stat-source">{dashboardSnapshot?.rank ? `${dashboardSnapshot.rank} · ${dashboardSnapshot.oj}` : "Not reported"}</span></div></div>
              <div className="stat-card stat-blue"><div className="stat-icon"><Icon name="clock" size={16} /></div><div><small>Average runtime</small><strong>{dashboardSnapshot?.averageRuntimeMs === undefined ? "—" : dashboardSnapshot.averageRuntimeMs.toFixed(1)}<small>{dashboardSnapshot?.averageRuntimeMs === undefined ? "" : " ms"}</small></strong><span className="stat-source">{dashboardSnapshot?.averageRuntimeMs === undefined ? "Not provided by this OJ" : "From fetched submissions"}</span></div></div>
            </div>

            <section className="oj-accounts-card glass-card">
              <div className="section-head"><div><span className="section-kicker">ONLINE JUDGES</span><h2>Connected accounts</h2></div><button onClick={() => setAccountOpen(true)}>Manage <Icon name="arrow" size={12} /></button></div>
              <div className="oj-account-list">
                {OJ_IDS.map((oj) => {
                  const definition = OJ_DEFINITIONS[oj];
                  const connection = connections.find((item) => item.oj === oj);
                  const snapshot = snapshots[oj];
                  return <div className="oj-account-row" key={oj}><span className={`oj-mark oj-${oj}`}>{definition.shortName.slice(0, 2)}</span><div><strong>{definition.name}</strong><small>{connection ? connection.handle : "Not connected"}</small></div><span className="oj-row-state">{ojLoading[oj] ? "Loading…" : ojErrors[oj] ? "Unavailable" : snapshot ? `Updated ${formatDateTime(snapshot.fetchedAt)}` : "No data"}</span><button onClick={() => { setHandleInputs((current) => ({ ...current, [oj]: connection?.handle ?? "" })); setAccountOpen(true); }}>Manage</button></div>;
                })}
              </div>
            </section>

            <div className="workspace-grid">
              <section className="editor-card glass-card">
                <div className="card-toolbar">
                  <div className="file-tabs"><button className="editor-tab active"><span className="cpp-dot" />main.cpp<span className="tab-close">×</span></button><button className="tab-plus" title="Create a new source file" onClick={() => { setCode(""); setSaved(false); enterEditor(); }}><Icon name="plus" size={13} /></button></div>
                  <div className="editor-tools"><span className="unsaved-state"><i className={saved ? "saved" : "unsaved"} />{saved ? "Saved" : "Unsaved"}</span><button onClick={() => setModal("templates")}>Template <Icon name="chevron" size={12} /></button><button title="Toggle format on save" onClick={() => setSettings((current) => ({ ...current, formatOnSave: !current.formatOnSave }))}><Icon name="spark" size={13} /></button></div>
                </div>
                <div className="editor-meta"><span>main.cpp</span><span>•</span><span>C++17</span><span>•</span><span>UTF-8</span><span className="meta-spacer" /><span><span className="status-dot purple" />Editor ready</span></div>
                <div className="code-editor" onClick={() => enterEditor()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") enterEditor(); }}>
                  <div className="code-glow" />
                  {code.split("\n").map((line, index) => (
                    <div className={`code-line ${index === 12 ? "current" : ""}`} key={`${line}-${index}`}>
                      <span className="line-number">{String(index + 1).padStart(2, "0")}</span><code>{highlightLine(line)}</code>
                    </div>
                  ))}
                  <div className="code-caret" />
                </div>
                <div className="editor-footer"><span><Icon name="files" size={13} /> C++ source</span><span className="meta-spacer" /><span>Ln 13, Col 5</span><span>Spaces: 4</span><button onClick={() => enterEditor()}>Focus mode <span>⌘ ⇧ F</span></button></div>
              </section>

              <aside className="inspector-column">
                <section className="run-card glass-card">
                  <div className="run-card-head"><div><span className="section-kicker">RUN CONFIGURATION</span><h2>Ready to run</h2></div><span className={`channel-mini ${channelInfo.className}`}><i />{channelInfo.label}</span></div>
                  <div className="config-row"><div className="config-select"><span className="language-mark">C++</span><div><small>Language</small><strong>GNU++17</strong></div><Icon name="chevron" size={13} /></div><div className="config-select small"><div><small>Engine</small><strong>Auto</strong></div><Icon name="chevron" size={13} /></div></div>
                  <div className="limit-grid"><div><Icon name="clock" size={13} /><span>Time limit</span><strong>1.0s</strong></div><div><Icon name="memory" size={13} /><span>Memory limit</span><strong>512 MB</strong></div></div>
                  <button className={`run-main ${running ? "is-running" : runPassed ? "is-passed" : ""}`} onClick={runCode} disabled={running}><span className="run-icon">{running ? <span className="mini-spinner" /> : runPassed ? <Icon name="check" size={15} /> : <Icon name="play" size={13} />}</span>{running ? "Running tests…" : runPassed ? "Run again" : "Run solution"}<kbd>F9</kbd></button>
                  <div className="run-footer"><span><span className="native-dot" /> Judge0 CE</span><span>C++17</span></div>
                </section>

                <section className="tests-card glass-card">
                  <div className="section-head"><div><span className="section-kicker">RUN RESULTS</span><h2>{runDuration !== null ? "Latest run" : "No run yet"}</h2></div><span className={`run-result-state ${running ? "loading" : runDuration !== null ? runPassed ? "passed" : "failed" : "idle"}`}>{running ? "Running…" : runDuration !== null ? runPassed ? "Passed" : "Failed" : "Ready"}</span></div>
                  <div className="test-list">
                    <div className="test-row result-row"><span className={`test-state ${running ? "pending" : runDuration !== null ? runPassed ? "passed" : "failed" : "pending"}`}>{runDuration !== null && runPassed ? <Icon name="check" size={11} /> : ""}</span><div><strong>{running ? "Compiling and running" : runDuration !== null ? runPassed ? "Program completed successfully" : "Program returned an error" : "Run the current file"}</strong><small>{running ? "Judge0 is processing the source" : runDuration !== null ? "Measured by Judge0" : "No result has been recorded"}</small></div><span className="test-time">{runDuration !== null ? `${runDuration.toFixed(1)} ms` : "—"}</span></div>
                  </div>
                  <button className="text-action" onClick={runCode} disabled={running}><Icon name="play" size={11} /> {running ? "Running…" : "Run current file"} <span>→</span></button>
                </section>
              </aside>
            </div>

            <div className={`bottom-grid ${isDesktop ? "" : "single"}`}>
              <section className="activity-card glass-card"><div className="section-head"><div><span className="section-kicker">RECENT ACTIVITY</span><h2>{recentSubmissions.length ? "Recent submissions" : "No submissions yet"}</h2></div><button onClick={() => setAccountOpen(true)}>Manage accounts <Icon name="arrow" size={12} /></button></div><div className="problem-list">{recentSubmissions.length ? recentSubmissions.map((submission, index) => <a className="submission-row" href={submission.url} target="_blank" rel="noreferrer" key={`${submission.oj}-${submission.id}`}><span className={`problem-index ${submission.accepted ? "green-number" : "amber-number"}`}>{String(index + 1).padStart(2, "0")}</span><div><strong>{submission.problem}</strong><small>{OJ_DEFINITIONS[submission.oj].name} · {submission.verdict} · {formatSubmissionDate(submission.submittedAt)}</small></div><span className={submission.accepted ? "solved-check" : "in-progress"}>{submission.accepted ? <Icon name="check" size={12} /> : submission.verdict}</span></a>) : <div className="activity-empty">{connections.length ? "The connected OJ has no submission rows available." : "Connect Codeforces, VNOJ, or TBCPCOJ to load activity."}</div>}</div></section>
              {isDesktop && (
              <section className="channel-card glass-card"><div className="section-head"><div><span className="section-kicker">RELEASE CHANNEL</span><h2>Choose your build</h2></div><Icon name="spark" size={16} /></div><div className="channel-switcher">{availableChannels.map((item) => <button key={item} className={`channel-option ${channel === item ? "selected" : ""} ${item}`} onClick={() => changeChannel(item)}><span className="channel-radio"><i /></span><div><strong>{item === "standard" ? "Standard" : item === "beta" ? "Beta" : "Nightly"}</strong><small>{item === "standard" ? "Stable & recommended" : item === "beta" ? "Try what's next" : "VIP Pro features"}</small></div>{item === "standard" && <span className="recommended">Recommended</span>}{item === "nightly" && <span className="vip-tag">VIP PRO</span>}</button>)}</div><div className={`channel-note ${channelInfo.className}`}><Icon name="spark" size={14} /><span><strong>{channelInfo.label}:</strong> {channel === "standard" ? "reliable builds for everyday coding." : channel === "beta" ? "preview features may change without notice." : "experimental lab features for power users."}</span></div></section>
              )}
            </div>

            <footer className="preview-footer"><span>ide.ankb <b>v1.2.0</b></span><span className="footer-separator">•</span><span>{connections.length ? "OJ data connected" : "Local workspace"}</span><span className="footer-spacer" /><button onClick={() => setModal("settings")}>Preferences</button></footer>
          </main>
        </div>
      </div>


      {accountOpen && <div className="modal-backdrop" onClick={() => setAccountOpen(false)}><div className="account-modal oj-modal" onClick={(event) => event.stopPropagation()}><div className="account-modal-head"><div className={`account-avatar-large ${connections.length ? "signed" : "guest"}`}>{connections.length || "OJ"}</div><div><span className="section-kicker">ONLINE JUDGE ACCOUNTS</span><h2>Connect your handles</h2><p>Only public profile data is requested. Handles are stored on this device.</p></div><button onClick={() => setAccountOpen(false)}><Icon name="close" size={16} /></button></div><div className="account-body"><div className="guest-note"><Icon name="cloud" size={17} /><div><strong>No invented statistics</strong><p>Metrics stay empty until an OJ returns data. Runtime is shown only when that judge reports it.</p></div></div>{OJ_IDS.map((oj) => { const definition = OJ_DEFINITIONS[oj]; const connection = connections.find((item) => item.oj === oj); const snapshot = snapshots[oj]; const error = ojErrors[oj]; const profileHandle = snapshot?.handle ?? connection?.handle ?? handleInputs[oj]; const profileUrl = `${definition.baseUrl}${definition.profilePath(profileHandle)}`; return <section className="judge-connection" key={oj}><div className="judge-connection-head"><div className={`oj-mark oj-${oj}`}>{definition.shortName.slice(0, 2)}</div><div><strong>{definition.name}</strong><small>{connection ? `Connected as ${connection.handle}` : "Not connected"}</small></div>{connection && <a href={snapshot?.profileUrl ?? profileUrl} target="_blank" rel="noreferrer">Open profile ↗</a>}</div><form className="account-connect-form" onSubmit={(event) => { event.preventDefault(); void connectOj(oj); }}><input value={handleInputs[oj]} onChange={(event) => setHandleInputs((current) => ({ ...current, [oj]: event.target.value }))} placeholder={`${definition.name} handle`} autoComplete="off" spellCheck={false} aria-label={`${definition.name} handle`} /><button type="submit" disabled={Boolean(ojLoading[oj])}>{ojLoading[oj] ? "Loading…" : connection ? "Refresh" : "Connect"}</button></form>{snapshot && <div className="judge-data-summary"><span>{snapshot.solved === undefined ? "—" : snapshot.solved.toLocaleString()} solved</span><span>{snapshot.rating === undefined ? "—" : snapshot.rating.toLocaleString()} rating</span><span>Updated {formatDateTime(snapshot.fetchedAt)}</span></div>}{error && <div className="oj-error" role="alert">Could not load data: {error}</div>}{connection && <button className="disconnect-button" onClick={() => disconnectOj(oj)}>Disconnect {definition.name}</button>}</section>; })}<small className="account-privacy">No password, token, or source code is sent to an OJ by this connection.</small></div></div></div>}

      {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="preview-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="section-kicker">IDE.ANKB</span><h2>{modal === "workspace" ? "Create workspace" : modal === "templates" ? "Template library" : modal === "settings" ? "Preferences" : "Search anything"}</h2></div><button onClick={() => setModal(null)}><Icon name="close" size={16} /></button></div>{modal === "workspace" && <div className="modal-content"><p>Start with a clean workspace or open an existing contest folder.</p><button className="modal-option" onClick={() => { setCode(templateSource); setSaved(false); setModal(null); showToast("Blank C++ workspace created"); }}><span className="option-icon blue"><Icon name="plus" size={17} /></span><span><strong>Blank C++ workspace</strong><small>main.cpp with your default template</small></span><Icon name="arrow" size={14} /></button><input ref={folderInputRef} className="hidden-file-input" type="file" accept=".cpp,.cc,.cxx,.txt" onChange={async (event) => { const file = Array.from(event.target.files ?? []).find((item) => item.name.toLowerCase() === "main.cpp") ?? event.target.files?.[0]; if (!file) return; setCode(await file.text()); setSaved(false); setModal(null); showToast(`${file.name} opened locally`); event.target.value = ""; }} /><button className="modal-option" onClick={() => folderInputRef.current?.click()}><span className="option-icon purple"><Icon name="files" size={17} /></span><span><strong>Open source file</strong><small>Import a C++ file from your computer</small></span><Icon name="arrow" size={14} /></button></div>}{modal === "templates" && <div className="modal-content"><p>Pick a source template to replace the current file.</p>{templateOptions.map((item, index) => <button className={`template-option ${code === item.code ? "selected" : ""}`} key={item.name} onClick={() => { setModal(null); setCode(item.code); setSaved(false); showToast(`${item.name} applied to main.cpp`); }}><span className="template-number">0{index + 1}</span><span><strong>{item.name}</strong><small>{item.description}</small></span>{code === item.code && <Icon name="check" size={15} />}</button>)}</div>}{modal === "settings" && <div className="modal-content settings-list"><p>These preferences apply to this workspace.</p>{([ ["formatOnSave", "Format on save", "Keep source formatting consistent"], ["autoSave", "Auto-save files", "Persist edits in this browser"] ] as const).map(([key, label, description]) => <button className="setting-row" key={key} onClick={() => setSettings((current) => ({ ...current, [key]: !current[key] }))}><span><strong>{label}</strong><small>{description}</small></span><span className={`toggle ${settings[key] ? "on" : ""}`}><i /></span></button>)}</div>}{modal === "search" && <div className="modal-content"><div className="search-input-wrap"><Icon name="search" size={16} /><input autoFocus value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Search files, commands, problems…" /></div><div className="search-results"><button onClick={() => { setModal(null); enterEditor(); }}><Icon name="files" size={15} /><span><strong>main.cpp</strong><small>Current source file</small></span><kbd>↵</kbd></button><button onClick={() => { setModal(null); void runCode(); }}><Icon name="play" size={13} /><span><strong>Run solution</strong><small>Command · F9</small></span><kbd>⌘ R</kbd></button><button onClick={() => { setModal(null); openNav("problems", "Problems"); }}><Icon name="flask" size={15} /><span><strong>Problems</strong><small>Problems view</small></span><kbd>↵</kbd></button></div></div>}</div></div>}
    </div>
  );
}

export default PreviewApp;
