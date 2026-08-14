import type { CompileResult } from "../lib/tauri";

interface StatusBarProps {
  result: CompileResult | null;
  running: boolean;
  cppVersion: string;
  compiler: string;
}

export default function StatusBar({ result, running, cppVersion, compiler }: StatusBarProps) {
  const statusText = running
    ? "⏳ Đang chạy..."
    : result
      ? result.success
        ? "✔ Thành công"
        : result.stage === "compile"
          ? "❌ Lỗi biên dịch"
          : result.stage === "error"
            ? "💥 Lỗi Runtime"
            : "❌ Thất bại"
      : "⚡ Sẵn sàng";

  const statusClass = running
    ? "status-running"
    : result
      ? result.success
        ? "status-ok"
        : "status-err"
      : "status-idle";

  return (
    <div className="statusbar">
      <div className="status-left">
        <span className={`status-indicator ${statusClass}`}>
          {statusText}
        </span>
        {result && (
          <span className="status-time">
            ⏱ {result.duration_ms?.toFixed(1)}ms
          </span>
        )}
      </div>
      <div className="status-right">
        <span className="status-chip">C++{cppVersion}</span>
        <span className="status-chip">{compiler.toUpperCase()}</span>
        <span className="status-chip">UTF-8</span>
        <span className="status-chip">LF</span>
      </div>
    </div>
  );
}
