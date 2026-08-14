import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

export default function Terminal() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
        black: "#0d1117",
        red: "#f85149",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#c9d1d9",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(termRef.current);

    // Fit after open
    setTimeout(() => fitAddon.fit(), 100);

    // Welcome message
    term.writeln("\x1b[1;36m⚡ ide.ankb Terminal\x1b[0m");
    term.writeln("\x1b[90mNhập lệnh để chạy. Hỗ trợ: gcc, g++, make, git...\x1b[0m");
    term.writeln("");
    term.write("\x1b[32m$\x1b[0m ");

    xtermRef.current = term;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    resizeObserver.observe(termRef.current);

    // Handle input - send to Tauri PTY
    term.onData(async (data) => {
      // TODO: Send to Tauri PTY backend
      // For now, just echo
      term.write(data);
    });

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  return (
    <div className="terminal-container" ref={termRef} />
  );
}
