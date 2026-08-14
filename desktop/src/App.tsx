import { useState, useCallback, useEffect, useRef } from "react";
import Editor from "./components/Editor";
import Output from "./components/Output";
import ContextMenu from "./components/ContextMenu";
import MenuBar, { type MenuDef } from "./components/MenuBar";
import {
  compile,
  readFile,
  saveFile,
  openFilesDialog,
  saveFileDialog,
  type CompileResult,
} from "./lib/tauri";
import { pingJudge0, runJudge0 } from "./lib/judge0";
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
type Engine = "auto" | "judge0" | "native";
type ToastType = "info" | "ok" | "warn" | "error";

interface Tab {
  id: string;
  name: string;
  path: string | null;
  content: string;
  savedContent: string;
}

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

// ---------- helpers ----------
let toastSeq = 0;
const uniqId = () =>
  `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const extOf = (name: string): string => {
  const m = /\.([^.\\/]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
};

const CPP_EXTS = ["cpp", "cc", "cxx", "c++", "c", "h", "hpp", "hh"];
const isCppExt = (e: string) => CPP_EXTS.includes(e);
const langOf = (name: string): string => {
  const e = extOf(name);
  if (e === "c") return "c";
  if (isCppExt(e)) return "cpp";
  return "plaintext";
};

const baseName = (p: string): string => {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
};

async function confirmDlg(msg: string): Promise<boolean> {
  try {
    const mod = await import("@tauri-apps/plugin-dialog");
    return await mod.ask(msg, { title: "ide.ankb", kind: "warning" });
  } catch {
    return window.confirm(msg);
  }
}

async function messageDlg(msg: string, title = "ide.ankb"): Promise<void> {
  try {
    const mod = await import("@tauri-apps/plugin-dialog");
    await mod.message(msg, { title });
  } catch {
    window.alert(msg);
  }
}

function restoreSession(): { tabs: Tab[]; activeId: string } {
  try {
    const raw = localStorage.getItem("ide.ankb:tabs");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs)) {
        const tabs: Tab[] = parsed.tabs
          .filter((t: any) => t && typeof t.id === "string" && typeof t.name === "string")
          .map((t: any) => ({
            id: t.id,
            name: t.name,
            path: typeof t.path === "string" ? t.path : null,
            content: typeof t.content === "string" ? t.content : "",
            savedContent: typeof t.savedContent === "string" ? t.savedContent : "",
          }));
        if (tabs.length) {
          const activeId = tabs.some((t) => t.id === parsed.activeId)
            ? parsed.activeId
            : tabs[0].id;
          return { tabs, activeId };
        }
      }
    }
  } catch {
    /* ignore corrupt session */
  }
  const t: Tab = {
    id: uniqId(),
    name: "main.cpp",
    path: null,
    content: DEFAULT_CODE,
    savedContent: DEFAULT_CODE,
  };
  return { tabs: [t], activeId: t.id };
}

const ABOUT_TEXT = `ide.ankb — C++ IDE (Desktop v1.1.0)

Editor: Monaco Editor
Engine: Judge0 CE khi ONLINE • g++ nội bộ khi OFFLINE
(tự tìm g++ trong Code::Blocks / MSYS2 / WinLibs / TDM-GCC…)

F9        Run
Ctrl+O    Open file(s)
Ctrl+S    Save
Ctrl+N    New tab
Ctrl+W    Close tab

© 2026 ide.ankb — github.com/ankbuitv/ide`;

const SHORTCUTS_TEXT = `Keyboard shortcuts

F9 / Ctrl+Enter — Chạy code
Ctrl+O — Mở nhiều file (cpp, c, h, txt, inp, out…)
Ctrl+S — Lưu tab hiện tại
Ctrl+Shift+S — Save As…
Ctrl+N — Tab mới
Ctrl+W — Đóng tab
Ctrl+Z / Ctrl+Y — Undo / Redo
Ctrl+F / Ctrl+H — Find / Replace (trong editor)
F1 / Ctrl+Shift+P — Command Palette (trong editor)
Chuột phải — Context menu ide.ankb (giống bản web)`;

function App() {
  // ---------- tabs ----------
  const [session] = useState(restoreSession);
  const [tabs, setTabs] = useState<Tab[]>(session.tabs);
  const [activeId, setActiveId] = useState<string>(session.activeId);

  // ---------- run / io ----------
  const [stdin, setStdin] = useState<string>(
    () => localStorage.getItem("ide.ankb:stdin") ?? "",
  );
  const [result, setResult] = useState<CompileResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [statusMsg, setStatusMsg] = useState("Ready");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  // ---------- settings ----------
  const [cppVersion, setCppVersion] = useState("17");
  const [compiler, setCompiler] = useState<"gcc" | "clang" | "msvc">("gcc");
  const [engine, setEngine] = useState<Engine>(() => {
    const v = localStorage.getItem("ide.ankb:engine");
    return v === "judge0" || v === "native" ? v : "auto";
  });
  const [fontSize, setFontSize] = useState<number>(
    () => Number(localStorage.getItem("ide.ankb:fontSize")) || 14,
  );
  const [minimap, setMinimap] = useState<boolean>(
    () => localStorage.getItem("ide.ankb:minimap") !== "0",
  );

  // ---------- net / ui ----------
  const [online, setOnline] = useState<boolean | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // refs mirror (cho callback ổn định)
  const tabsRef = useRef(tabs);
  const activeIdRef = useRef(activeId);
  const stdinRef = useRef(stdin);
  const resultRef = useRef(result);
  const runningRef = useRef(running);
  const onlineRef = useRef(online);
  const engineRef = useRef(engine);
  const cppVersionRef = useRef(cppVersion);
  const compilerRef = useRef(compiler);
  const minimapRef = useRef(minimap);
  const runStateTimer = useRef<number | null>(null);
  const editorRef = useRef<any>(null);
  const newTabCounter = useRef(1);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { stdinRef.current = stdin; localStorage.setItem("ide.ankb:stdin", stdin); }, [stdin]);
  useEffect(() => { resultRef.current = result; }, [result]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { engineRef.current = engine; localStorage.setItem("ide.ankb:engine", engine); }, [engine]);
  useEffect(() => { cppVersionRef.current = cppVersion; }, [cppVersion]);
  useEffect(() => { compilerRef.current = compiler; }, [compiler]);
  useEffect(() => { minimapRef.current = minimap; localStorage.setItem("ide.ankb:minimap", minimap ? "1" : "0"); }, [minimap]);
  useEffect(() => { localStorage.setItem("ide.ankb:fontSize", String(fontSize)); }, [fontSize]);

  // Auto-save session
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem("ide.ankb:tabs", JSON.stringify({ tabs, activeId }));
      } catch {
        /* storage full etc. */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [tabs, activeId]);

  // ---------- toast ----------
  const toast = useCallback((msg: string, type: ToastType = "info", ms = 3200) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, msg, type }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  // ---------- connectivity: ping Judge0 định kỳ ----------
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (navigator.onLine === false) {
        setOnline(false);
        return;
      }
      const ok = await pingJudge0();
      if (alive) setOnline(ok);
    };
    check();
    const iv = window.setInterval(check, 15000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);

  const recheckConnection = useCallback(async () => {
    setOnline(null);
    setStatusMsg("Checking connection…");
    const ok = await pingJudge0();
    setOnline(ok);
    setStatusMsg(ok ? "Online — Judge0" : "Offline — Native");
    toast(
      ok ? "Có Internet — chạy code bằng Judge0 CE" : "Không có Internet — chạy bằng compiler nội bộ",
      ok ? "ok" : "warn",
      2400,
    );
  }, [toast]);

  // ---------- tab ops ----------
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const setTabContent = useCallback((id: string, content: string) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, content } : t)));
  }, []);

  const newTab = useCallback((name?: string, content?: string) => {
    const finalName = name ?? `untitled-${newTabCounter.current++}.cpp`;
    const initial = content ?? (isCppExt(extOf(finalName)) ? DEFAULT_CODE : "");
    const tab: Tab = {
      id: uniqId(),
      name: finalName,
      path: null,
      content: initial,
      savedContent: initial,
    };
    setTabs((ts) => [...ts, tab]);
    setActiveId(tab.id);
    toast(`Tab mới: ${finalName}`, "info", 1400);
  }, [toast]);

  const closeTab = useCallback(
    async (id: string) => {
      const cur = tabsRef.current;
      const tab = cur.find((t) => t.id === id);
      if (!tab) return;
      if (tab.content !== tab.savedContent) {
        const ok = await confirmDlg(`"${tab.name}" có thay đổi chưa lưu. Đóng luôn?`);
        if (!ok) return;
      }
      let next = cur.filter((t) => t.id !== id);
      if (!next.length) {
        next = [
          {
            id: uniqId(),
            name: "main.cpp",
            path: null,
            content: DEFAULT_CODE,
            savedContent: DEFAULT_CODE,
          },
        ];
      }
      if (activeIdRef.current === id) {
        const idx = cur.findIndex((t) => t.id === id);
        setActiveId(next[Math.min(idx, next.length - 1)].id);
      }
      setTabs(next);
    },
    [],
  );

  const openFiles = useCallback(async () => {
    let paths: string[] = [];
    try {
      paths = await openFilesDialog();
    } catch (e) {
      toast(`Không mở được hộp thoại file: ${String(e)}`, "error");
      return;
    }
    if (!paths.length) return;
    const created: Tab[] = [];
    let failed = 0;
    for (const p of paths) {
      const dup =
        tabsRef.current.find((t) => t.path === p) ||
        created.find((t) => t.path === p);
      if (dup) {
        setActiveId(dup.id);
        continue;
      }
      try {
        const content = await readFile(p);
        created.push({
          id: uniqId(),
          name: baseName(p),
          path: p,
          content,
          savedContent: content,
        });
      } catch {
        failed++;
        toast(`Không đọc được file: ${p}`, "error");
      }
    }
    if (created.length) {
      setTabs((ts) => [...ts, ...created]);
      setActiveId(created[created.length - 1].id);
      toast(`Đã mở ${created.length} file`, "ok", 1800);
    } else if (!failed) {
      toast("Các file đã được mở sẵn trong tab", "info", 1800);
    }
  }, [toast]);

  const saveTab = useCallback(
    async (id: string, saveAs = false) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab) return;
      let path = tab.path;
      if (!path || saveAs) {
        const chosen = await saveFileDialog(tab.name);
        if (!chosen) return;
        path = chosen;
      }
      try {
        await saveFile(path, tab.content);
      } catch (e) {
        toast(`Lưu thất bại: ${String(e)}`, "error");
        return;
      }
      const name = baseName(path);
      setTabs((ts) =>
        ts.map((t) => (t.id === id ? { ...t, path, name, savedContent: t.content } : t)),
      );
      toast(`Đã lưu ${name}`, "ok", 1800);
    },
    [toast],
  );

  // ---------- editor actions ----------
  const edRun = useCallback(
    (actionId: string, commandId?: string) => {
      const ed = editorRef.current;
      if (!ed) {
        toast("Editor chưa sẵn sàng", "warn", 1600);
        return;
      }
      ed.focus();
      try {
        if (commandId) ed.trigger("menu", commandId, null);
        else ed.getAction(actionId)?.run();
      } catch {
        try {
          ed.getAction(actionId)?.run();
        } catch {
          toast("Action không khả dụng", "warn", 1600);
        }
      }
    },
    [toast],
  );

  const formatDoc = useCallback(() => {
    edRun("editor.action.formatDocument");
  }, [edRun]);

  // ---------- run ----------
  const handleRun = useCallback(
    async (force?: "judge0" | "native") => {
      if (runningRef.current) return;
      const tabsNow = tabsRef.current;
      let srcTab = tabsNow.find((t) => t.id === activeIdRef.current) ?? tabsNow[0];
      if (!isCppExt(extOf(srcTab.name))) {
        const cand = tabsNow.find((t) => isCppExt(extOf(t.name)));
        if (cand) {
          toast(`"${srcTab.name}" không phải C/C++ — chạy "${cand.name}"`, "warn", 2200);
          srcTab = cand;
        } else {
          toast("Không có file C/C++ nào đang mở để chạy", "error");
          return;
        }
      }

      setRunning(true);
      setRunState("running");
      setResult(null);
      setStatusMsg("Compiling & running…");
      if (runStateTimer.current) window.clearTimeout(runStateTimer.current);

      // stdin: ô Input, hoặc tab .inp đầu tiên nếu ô Input trống
      const stdinNow = stdinRef.current;
      const inpTab = tabsNow.find((t) => extOf(t.name) === "inp");
      const input = stdinNow.trim().length ? stdinNow : (inpTab?.content ?? "");
      if (!stdinNow.trim().length && inpTab) {
        toast(`Input trống — dùng stdin từ tab "${inpTab.name}"`, "info", 2000);
      }

      const eng = force ?? engineRef.current;
      const ver = cppVersionRef.current;
      const comp = compilerRef.current;
      const wantJudge0 =
        eng === "judge0" || (eng === "auto" && onlineRef.current === true);

      try {
        let res: CompileResult;
        if (wantJudge0) {
          try {
            setStatusMsg("Running on Judge0 CE…");
            res = await runJudge0(srcTab.content, input, ver);
          } catch (e) {
            if (eng === "judge0") throw e;
            setOnline(false);
            setStatusMsg("Judge0 lỗi — chuyển Native…");
            toast("Judge0 không phản hồi — chạy bằng compiler nội bộ", "warn", 2800);
            res = await compile({
              code: srcTab.content,
              stdin: input,
              cppVersion: ver,
              compiler: comp,
              flags: "-O2 -pipe",
            });
            res.engine = "native";
          }
        } else {
          setStatusMsg("Compiling locally…");
          res = await compile({
            code: srcTab.content,
            stdin: input,
            cppVersion: ver,
            compiler: comp,
            flags: "-O2 -pipe",
          });
          res.engine = "native";
        }
        setResult(res);
        setRunState(res.success ? "success" : "failed");
        setStatusMsg(
          res.success
            ? `Build succeeded (${res.engine === "judge0" ? "Judge0" : "Native"})`
            : "Build failed",
        );
        // Nếu có tab .out/.ans thì đổ stdout vào đó
        if (res.stdout) {
          const outTab = tabsRef.current.find((t) =>
            ["out", "ans"].includes(extOf(t.name)),
          );
          if (outTab) {
            setTabs((ts) =>
              ts.map((t) => (t.id === outTab.id ? { ...t, content: res.stdout } : t)),
            );
          }
        }
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
          engine: wantJudge0 ? "judge0" : "native",
        });
        setRunState("failed");
        setStatusMsg("Error");
      } finally {
        setRunning(false);
        runStateTimer.current = window.setTimeout(() => setRunState("idle"), 2200);
      }
    },
    [toast],
  );

  // ---------- misc actions ----------
  const resetTemplate = useCallback(async () => {
    const tab = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!tab) return;
    if (tab.content !== DEFAULT_CODE) {
      const ok = await confirmDlg(`Reset "${tab.name}" về template mặc định?`);
      if (!ok) return;
    }
    setTabContent(tab.id, DEFAULT_CODE);
    toast("Template restored", "ok", 1500);
  }, [setTabContent, toast]);

  const fallbackCopy = useCallback(
    (text: string) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast("Output copied", "ok", 1200);
      } catch {
        toast("Copy failed", "error", 2000);
      }
    },
    [toast],
  );

  const copyOutput = useCallback(() => {
    const r = resultRef.current;
    let text = "";
    if (r) {
      const parts = [r.compile_error, r.stdout, r.stderr].filter(
        (s) => s && s.trim(),
      );
      text = parts.join("\n");
    }
    if (!text) {
      toast("Chưa có output để copy — chạy code trước (F9)", "warn", 2000);
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast("Output copied", "ok", 1200),
        () => fallbackCopy(text),
      );
    } else {
      fallbackCopy(text);
    }
  }, [toast, fallbackCopy]);

  const openUrl = useCallback(
    async (url: string) => {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
      } catch {
        window.open(url, "_blank");
      }
    },
    [],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
    } catch {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        toast("Không đổi được fullscreen", "warn", 1600);
      }
    }
  }, [toast]);

  const exitApp = useCallback(async () => {
    const dirty = tabsRef.current.filter((t) => t.content !== t.savedContent);
    if (dirty.length) {
      const ok = await confirmDlg(
        `${dirty.length} file chưa lưu (${dirty.map((t) => t.name).join(", ")}). Thoát luôn?`,
      );
      if (!ok) return;
    }
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  }, []);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9" || (e.ctrlKey && !e.shiftKey && e.key === "Enter")) {
        e.preventDefault();
        handleRun();
      } else if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveTab(activeIdRef.current, e.shiftKey);
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openFiles();
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newTab();
      } else if (e.ctrlKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        closeTab(activeIdRef.current);
      } else if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRun, saveTab, openFiles, newTab, closeTab, toggleFullscreen]);

  // ---------- context menu actions (y chang bản web) ----------
  const ctxActions = {
    run: () => handleRun(),
    format: formatDoc,
    reset: resetTemplate,
    openFile: openFiles,
    download: () => saveTab(activeIdRef.current, true),
    clearInput: () => {
      setStdin("");
      toast("Đã xóa input", "ok", 1200);
    },
    clearOutput: () => {
      setResult(null);
      toast("Đã xóa output", "ok", 1200);
    },
    copyOutput,
    reload: () => window.location.reload(),
    about: () => messageDlg(ABOUT_TEXT),
  };

  // ---------- menu bar ----------
  const menus: MenuDef[] = [
    {
      id: "file",
      label: "File",
      entries: [
        { label: "New Tab", shortcut: "Ctrl+N", action: () => newTab() },
        { label: "Open File...", shortcut: "Ctrl+O", action: openFiles },
        { label: "Save", shortcut: "Ctrl+S", action: () => saveTab(activeIdRef.current) },
        { label: "Save As...", shortcut: "Ctrl+Shift+S", action: () => saveTab(activeIdRef.current, true) },
        { label: "Close Tab", shortcut: "Ctrl+W", action: () => closeTab(activeIdRef.current) },
        "-",
        { label: "Reload App", action: () => window.location.reload() },
        { label: "Exit", action: exitApp },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      entries: [
        { label: "Undo", shortcut: "Ctrl+Z", action: () => edRun("", "undo") },
        { label: "Redo", shortcut: "Ctrl+Y", action: () => edRun("", "redo") },
        "-",
        { label: "Cut", shortcut: "Ctrl+X", action: () => edRun("", "editor.action.clipboardCutAction") },
        { label: "Copy", shortcut: "Ctrl+C", action: () => edRun("", "editor.action.clipboardCopyAction") },
        {
          label: "Paste",
          shortcut: "Ctrl+V",
          action: async () => {
            const ed = editorRef.current;
            if (!ed) return;
            try {
              const text = await navigator.clipboard.readText();
              const sel = ed.getSelection();
              if (text && sel) {
                ed.executeEdits("paste", [{ range: sel, text, forceMoveMarkers: true }]);
                ed.focus();
              }
            } catch {
              toast("Không đọc được clipboard — dùng Ctrl+V trong editor", "warn", 2200);
            }
          },
        },
        "-",
        { label: "Select All", shortcut: "Ctrl+A", action: () => {
            const ed = editorRef.current;
            const model = ed?.getModel?.();
            if (ed && model) {
              ed.setSelection(model.getFullModelRange());
              ed.focus();
            }
          } },
        { label: "Find", shortcut: "Ctrl+F", action: () => edRun("editor.actions.find") },
        { label: "Replace", shortcut: "Ctrl+H", action: () => edRun("editor.action.startFindReplaceAction") },
        "-",
        { label: "Format Document", action: formatDoc },
      ],
    },
    {
      id: "view",
      label: "View",
      entries: [
        { label: "Minimap", checked: minimap, action: () => setMinimap(!minimapRef.current) },
        { label: "Zoom In", shortcut: "+", action: () => setFontSize((s) => Math.min(30, s + 1)) },
        { label: "Zoom Out", shortcut: "-", action: () => setFontSize((s) => Math.max(9, s - 1)) },
        { label: "Reset Zoom", shortcut: "14px", action: () => setFontSize(14) },
        "-",
        { label: "Toggle Fullscreen", shortcut: "F11", action: toggleFullscreen },
      ],
    },
    {
      id: "run",
      label: "Run",
      entries: [
        { label: "Run", shortcut: "F9", action: () => handleRun() },
        { label: "Run bằng Judge0 (online)", action: () => handleRun("judge0") },
        { label: "Run Native (offline)", action: () => handleRun("native") },
        "-",
        {
          label: "Engine: Auto (có mạng → Judge0, mất mạng → Native)",
          checked: engine === "auto",
          action: () => { setEngine("auto"); toast("Engine: Auto — online dùng Judge0, offline dùng Native", "ok", 2200); },
        },
        {
          label: "Engine: Judge0 CE (luôn online)",
          checked: engine === "judge0",
          action: () => { setEngine("judge0"); toast("Engine: Judge0 CE", "ok", 1600); },
        },
        {
          label: "Engine: Native (g++ nội bộ)",
          checked: engine === "native",
          action: () => { setEngine("native"); toast("Engine: Native compiler", "ok", 1600); },
        },
      ],
    },
    {
      id: "help",
      label: "Help",
      entries: [
        { label: "About ide.ankb", action: () => messageDlg(ABOUT_TEXT) },
        { label: "Keyboard Shortcuts", action: () => messageDlg(SHORTCUTS_TEXT, "ide.ankb — Shortcuts") },
        { label: "Check Connection", action: recheckConnection },
        "-",
        { label: "Mở ide.ankb bản Web", action: () => openUrl("https://ide.ankb.qzz.io") },
        { label: "GitHub Repository", action: () => openUrl("https://github.com/ankbuitv/ide") },
      ],
    },
  ];

  const runBtnClass =
    runState === "running"
      ? "run-btn running"
      : runState === "success"
        ? "run-btn success"
        : runState === "failed"
          ? "run-btn failed"
          : "run-btn";

  // Badge engine — online ? Judge0 : Native
  const netBadge = (() => {
    if (engine === "native")
      return {
        cls: "badge connecting",
        label: "Native",
        title: "Engine: Native — compiler nội bộ (g++/clang/MSVC). Đổi trong menu Run.",
      };
    if (engine === "judge0")
      return online === false
        ? { cls: "badge offline", label: "Judge0 ✗", title: "Judge0 được chọn nhưng không kết nối được. Nhấn để thử lại." }
        : { cls: "badge online", label: "Judge0", title: "Engine: Judge0 CE (online). Nhấn để kiểm tra lại." };
    if (online === null)
      return { cls: "badge connecting", label: "Checking…", title: "Đang kiểm tra kết nối…" };
    return online
      ? { cls: "badge online", label: "Judge0", title: "Có Internet — chạy bằng Judge0 CE.\nMất mạng sẽ tự chuyển Native. Nhấn để kiểm tra lại." }
      : { cls: "badge offline", label: "Native", title: "Không có Internet — chạy bằng compiler nội bộ (g++ trong Code::Blocks/MSYS2…).\nNhấn để kiểm tra lại." };
  })();

  const modeLabel =
    engine === "auto"
      ? online === null
        ? "Auto"
        : online
          ? "Judge0"
          : "Native"
      : engine === "judge0"
        ? "Judge0"
        : "Native";

  return (
    <div className="app">
      {/* ===== Activity bar (left icon rail) ===== */}
      <nav className="side-rail no-select" aria-label="Activity Bar">
        <div className="side-icon active" title="Open File(s) (Ctrl+O)" onClick={openFiles}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
        </div>
        <div className="side-icon" title="Search in file (Ctrl+F)" onClick={() => edRun("editor.actions.find")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        </div>
        <div className="side-icon" title="GitHub Repository" onClick={() => openUrl("https://github.com/ankbuitv/ide")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M6 9v6" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
        </div>
        <div className="side-icon" title="Run (F9)" onClick={() => handleRun()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="6 3 20 12 6 21 6 3" /></svg>
        </div>
        <div className="spacer" />
        <div className="side-icon" title="New Tab (Ctrl+N)" onClick={() => newTab()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </div>
        <div className="side-icon" title="Save tab (Ctrl+S)" onClick={() => saveTab(activeIdRef.current)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
        </div>
        <div className="side-icon" title="View settings" onClick={() => setOpenMenu(openMenu === "view" ? null : "view")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
      </nav>

      {/* ===== Top bar ===== */}
      <header className="topbar no-select">
        <div className="brand">
          <img className="logo-img" src="/logo.png" alt="ide.ankb" width="28" height="28" />
          <span className="brand-text">ide.ankb</span>
        </div>
        <MenuBar menus={menus} openId={openMenu} onOpen={setOpenMenu} />
        <div className="crumbs" aria-hidden="true">
          <span>workspace</span>
          <span className="sep">/</span>
          <span className="file">
            {activeTab && activeTab.content !== activeTab.savedContent ? "● " : ""}
            {activeTab?.name}
          </span>
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
        <div className="select-wrap" title="Native compiler (chỉ dùng khi chạy Native)">
          <select value={compiler} onChange={(e) => setCompiler(e.target.value as any)}>
            <option value="gcc">GCC</option>
            <option value="clang">Clang</option>
            <option value="msvc">MSVC</option>
          </select>
        </div>

        <div
          className={netBadge.cls}
          title={netBadge.title}
          onClick={recheckConnection}
          style={{ cursor: "pointer" }}
        >
          <span className="dot" />
          <span>{netBadge.label}</span>
        </div>

        <button className={runBtnClass} onClick={() => handleRun()} disabled={running} title="Run (F9)">
          {running ? (
            <span className="spinner" />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z" /></svg>
          )}
          <span>{running ? "Running…" : "Run"}</span>
          <span className="key">F9</span>
        </button>
      </header>

      {/* ===== Tab bar (nhiều file: cpp, c, txt, inp, out…) ===== */}
      <div className="tabbar">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            className={"tab" + (t.id === activeId ? " active" : "")}
            title={t.path || t.name}
            onClick={() => setActiveId(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeTab(t.id);
              }
            }}
          >
            <span className="lang-dot" />
            <span className="tab-name">
              {t.content !== t.savedContent ? "● " : ""}
              {t.name}
            </span>
            <span
              className="close"
              title="Close (Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
            >
              ×
            </span>
          </div>
        ))}
        <div className="tab-add no-select" title="New Tab (Ctrl+N)" onClick={() => newTab()}>
          +
        </div>
        <div className="tab-actions no-select">
          <span className="chip">C++{cppVersion}</span>
          <span className="chip">{compiler.toUpperCase()}</span>
          <span className="chip" title="Engine đang dùng">{modeLabel}</span>
        </div>
      </div>

      {/* ===== Work area ===== */}
      <main className="workarea">
        <section className="editor-pane" aria-label="Code editor">
          <div className="editor-host">
            {activeTab && (
              <Editor
                key="editor"
                path={`/tabs/${activeTab.id}`}
                code={activeTab.content}
                onChange={(v) => setTabContent(activeTab.id, v)}
                language={langOf(activeTab.name)}
                fontSize={fontSize}
                minimap={minimap}
                onCursorChange={(line, col) => setCursor({ line, col })}
                onMountRef={(ed) => { editorRef.current = ed; }}
              />
            )}
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
              id="stdin"
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
              <button className="icon-btn" title="Copy output" onClick={copyOutput}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              </button>
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
        <span className="seg" title="Engine">Mode: {modeLabel}</span>
        {running && (
          <div className="build-progress"><div className="bar" /></div>
        )}
        <div className="right">
          <span className="seg" title="Compiler / Engine">{result?.compiler_used || compiler.toUpperCase()}</span>
          <span className={`seg ${runState === "failed" ? "err" : runState === "success" ? "ok" : ""}`}>{statusMsg}</span>
          <span className="seg">{result ? `${result.duration_ms?.toFixed(1)} ms` : "— ms"}</span>
        </div>
      </footer>

      {/* Context menu (chuột phải — y chang bản web) */}
      <ContextMenu actions={ctxActions} />

      {/* Toasts */}
      <div className="toast-host no-select">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + t.type}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
