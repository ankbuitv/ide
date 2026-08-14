/**
 * ide.ankb — Context Menu (desktop)
 * Sao chép y chang menu chuột phải của bản web (public/security.js):
 * cùng thứ tự item, cùng icon, cùng shortcut chip, cùng tên class CSS.
 * MỌI item đều gắn action thật — nhấn là chạy, không có item "để trưng".
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuActions {
  run: () => void;
  format: () => void;
  reset: () => void;
  openFile: () => void;
  download: () => void;
  clearInput: () => void;
  clearOutput: () => void;
  copyOutput: () => void;
  reload: () => void;
  about: () => void;
}

interface MenuState {
  x: number;
  y: number;
  zone: string;
}

type Entry =
  | { kind: "header"; label: string }
  | { kind: "sep" }
  | {
      kind: "item";
      label: string;
      icon?: string; // svg markup, giống hệt bản web
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onClick: () => void;
    };

function detectZone(t: HTMLElement | null): string {
  if (!t) return "Workspace";
  const c = (sel: string) => (t.closest ? t.closest(sel) : null);
  if (c(".editor-pane") || c(".editor-host") || c(".monaco-editor")) return "Editor";
  if (c(".right-pane")) {
    if (c("#stdin")) return "Input";
    if (c(".output-pane") || c("#output")) return "Output";
    return "Panel";
  }
  if (c(".sidebar") || c(".side-rail")) return "Sidebar";
  if (c(".topbar")) return "Top Bar";
  if (c(".tabbar")) return "Tab Bar";
  if (c(".statusbar")) return "Status Bar";
  return "Workspace";
}

export default function ContextMenu({ actions }: { actions: ContextMenuActions }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setMenu(null);

  useEffect(() => {
    const onContextMenu = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      setMenu({ x: ev.clientX, y: ev.clientY, zone: detectZone(ev.target as HTMLElement) });
      return false;
    };
    const onClick = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement;
      if (!el.closest || !el.closest("#ctx-menu")) setMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMenu(null);
    };
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  // Clamp inside viewport (giống hàm position() của bản web)
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = menu;
    if (x + w > vw - 4) x = vw - w - 4;
    if (y + h > vh - 4) y = vh - h - 4;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [menu]);

  if (!menu) return null;

  // Danh sách item — y chang bản web
  const entries: Entry[] = [
    { kind: "header", label: `Context · ${menu.zone}` },
    {
      kind: "item",
      label: "🟢 Run",
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>',
      shortcut: "F9",
      onClick: actions.run,
    },
    {
      kind: "item",
      label: "Format Document",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/></svg>',
      shortcut: "⇧⌘F",
      onClick: actions.format,
    },
    {
      kind: "item",
      label: "Reset to Template",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
      danger: true,
      onClick: actions.reset,
    },
    { kind: "sep" },
    {
      kind: "item",
      label: "Open File...",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      onClick: actions.openFile,
    },
    {
      kind: "item",
      label: "Download File",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      onClick: actions.download,
    },
    { kind: "sep" },
    {
      kind: "item",
      label: "Clear Input",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
      onClick: actions.clearInput,
    },
    {
      kind: "item",
      label: "Clear Output",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
      onClick: actions.clearOutput,
    },
    {
      kind: "item",
      label: "Copy Output",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      shortcut: "⌘C",
      onClick: actions.copyOutput,
    },
    { kind: "sep" },
    {
      kind: "item",
      label: "Reload",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
      onClick: actions.reload,
    },
    {
      kind: "item",
      label: "About ide.ankb",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
      onClick: actions.about,
    },
  ];

  return (
    <div id="ctx-menu" role="menu" ref={menuRef}>
      <ul>
        {entries.map((e, i) => {
          if (e.kind === "sep") {
            return <li key={i} className="ctx-sep" role="separator" />;
          }
          if (e.kind === "header") {
            return (
              <li key={i} className="ctx-item header">
                {e.label}
              </li>
            );
          }
          return (
            <li
              key={i}
              className={
                "ctx-item" + (e.disabled ? " disabled" : "") + (e.danger ? " danger" : "")
              }
              onClick={(ev) => {
                ev.stopPropagation();
                close();
                if (!e.disabled) e.onClick();
              }}
            >
              {e.icon && (
                <span className="ctx-ico" dangerouslySetInnerHTML={{ __html: e.icon }} />
              )}
              <span className="ctx-text">{e.label}</span>
              {e.shortcut && <span className="ctx-sc">{e.shortcut}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
