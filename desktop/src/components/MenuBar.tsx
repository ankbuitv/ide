/**
 * ide.ankb — Menu bar (File / Edit / View / Run / Help)
 * Dropdown thật sự: hover để chuyển menu khi đang mở, click ngoài/Esc để đóng.
 * Mọi item đều do App truyền action vào — BẮT BUỘC hoạt động.
 */

import { useEffect } from "react";

export interface MenuItemDef {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  action: () => void;
}

export type MenuEntry = MenuItemDef | "-";

export interface MenuDef {
  id: string;
  label: string;
  entries: MenuEntry[];
}

interface MenuBarProps {
  menus: MenuDef[];
  openId: string | null;
  onOpen: (id: string | null) => void;
}

export default function MenuBar({ menus, openId, onOpen }: MenuBarProps) {
  // Click ngoài / Esc → đóng menu
  useEffect(() => {
    if (!openId) return;
    const onDown = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement;
      if (!el.closest || !el.closest(".menu-wrap")) onOpen(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onOpen(null);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [openId, onOpen]);

  return (
    <div className="menu-bar">
      {menus.map((m) => {
        const open = openId === m.id;
        return (
          <div className="menu-wrap" key={m.id}>
            <div
              className={"menu-item" + (open ? " open" : "")}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(open ? null : m.id);
              }}
              onMouseEnter={() => {
                if (openId !== null && !open) onOpen(m.id);
              }}
            >
              {m.label}
            </div>
            {open && (
              <div className="menu-dropdown" role="menu">
                {m.entries.map((entry, i) =>
                  entry === "-" ? (
                    <div key={i} className="menu-sep" role="separator" />
                  ) : (
                    <div
                      key={i}
                      className={
                        "menu-entry" +
                        (entry.disabled ? " disabled" : "") +
                        (entry.danger ? " danger" : "")
                      }
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (entry.disabled) return;
                        onOpen(null);
                        entry.action();
                      }}
                    >
                      <span className="menu-check">{entry.checked ? "✓" : ""}</span>
                      <span className="menu-label">{entry.label}</span>
                      {entry.shortcut && <span className="menu-sc">{entry.shortcut}</span>}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
