import type { CompileResult } from "../lib/tauri";

interface OutputProps {
  result: CompileResult | null;
  running: boolean;
}

export default function Output({ result, running }: OutputProps) {
  if (running) {
    return (
      <div className="output-panel">
        <div className="output-loading">
          <div className="spinner" />
          <span>Đang biên dịch và chạy...</span>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="output-panel">
        <div className="output-empty">
          Nhấn <kbd>F9</kbd> hoặc nút <b>▶ Chạy</b> để biên dịch và chạy code
        </div>
      </div>
    );
  }

  return (
    <div className="output-panel">
      {/* Compile Error */}
      {result.stage === "compile" && result.compile_error && (
        <div className="output-error">
          <div className="error-header">❌ Lỗi biên dịch</div>
          <pre className="error-detail">{result.compile_error}</pre>
        </div>
      )}

      {/* Runtime Error */}
      {result.stage === "error" && (
        <div className="output-error">
          <div className="error-header">💥 Lỗi Runtime</div>
          <pre className="error-detail">{result.stderr}</pre>
        </div>
      )}

      {/* Success output */}
      {result.stage === "run" && (
        <>
          {result.stdout ? (
            <pre className="output-stdout">{result.stdout}</pre>
          ) : (
            <div className="output-empty">
              // Không có output
            </div>
          )}
          {result.stderr && (
            <pre className="output-stderr">
              <span className="stderr-label">⚠️ stderr:</span>
              {"\n"}{result.stderr}
            </pre>
          )}
        </>
      )}

      {/* Meta bar */}
      <div className="output-meta">
        <span className={result.success ? "meta-ok" : "meta-err"}>
          {result.success ? "✅ Thành công" : "❌ Thất bại"}
        </span>
        <span>⏱ {result.duration_ms?.toFixed(1)}ms</span>
        {result.exit_code != null && (
          <span>exit: {result.exit_code}</span>
        )}
        {result.timed_out && (
          <span className="meta-warn">⏳ Quá thời gian</span>
        )}
        {result.signal && (
          <span>signal: {result.signal}</span>
        )}
      </div>
    </div>
  );
}
