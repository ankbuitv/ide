import type { CompileResult } from "../lib/tauri";

interface OutputProps {
  result: CompileResult | null;
  running: boolean;
}

export default function Output({ result, running }: OutputProps) {
  if (running) {
    return (
      <div className="output info output-pane">
        <div className="output-loading">
          <span className="spinner dark" />
          <span>Compiling &amp; running…</span>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="output output-pane">
        <div className="empty">// Run your code (F9) to see the output here</div>
      </div>
    );
  }

  const cls = result.success ? "output success output-pane" : "output error output-pane";

  return (
    <div className={cls}>
      {/* Compile Error */}
      {result.stage === "compile" && result.compile_error && (
        <>
          <div className="compile-error">❌ Compilation Error</div>
          <pre className="stderr">{result.compile_error}</pre>
        </>
      )}

      {/* Runtime Error */}
      {result.stage === "error" && (
        <>
          <div className="compile-error">💥 Runtime Error</div>
          <pre className="stderr">{result.stderr}</pre>
        </>
      )}

      {/* Program output */}
      {result.stage === "run" && (
        <>
          {result.stdout ? (
            <pre className="stdout">{result.stdout}</pre>
          ) : (
            <div className="empty">// (no output)</div>
          )}
          {result.stderr && (
            <pre className="stderr">{"stderr:\n"}{result.stderr}</pre>
          )}
        </>
      )}

      {/* Meta bar */}
      <div className="meta">
        <span className={result.success ? "ok" : "err"}>
          {result.success ? "✓ Success" : "✗ Failed"}
        </span>
        {result.engine && (
          <span>{result.engine === "judge0" ? "🌐 Judge0" : "💻 Native"}</span>
        )}
        <span>⏱ {result.duration_ms?.toFixed(1)} ms</span>
        {result.exit_code != null && <span>exit: {result.exit_code}</span>}
        {result.timed_out && <span className="err">⏳ Timed out</span>}
        {result.signal && <span>signal: {result.signal}</span>}
        {result.compiler_used && <span>{result.compiler_used}</span>}
      </div>
    </div>
  );
}
