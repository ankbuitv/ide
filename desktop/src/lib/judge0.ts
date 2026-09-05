/**
 * ide.ankb — Judge0 CE engine (online mode)
 * Khi có Internet: chạy code bằng Judge0 CE (giống bản web).
 * Khi offline / Judge0 chết: App tự fallback sang engine native (g++ nội bộ).
 */

import type { CompileResult } from "./tauri";
import { isTauriRuntime } from "./platform";

export const JUDGE0_BASE = "https://ce.judge0.com";

/** Same-origin API fallback used by the web build (Cloudflare /api/run). */
const API_RUN_ENDPOINT = "/api/run";

// language_id on Judge0 CE: 54 = "C++ (GCC 9.2.0)" — same value the web
// version uses in tryJudge0Direct().
const CPP_LANGUAGE_ID = 54;

function b64enc(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function b64dec(s?: string | null): string {
  if (!s) return "";
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    try {
      return atob(s);
    } catch {
      return "";
    }
  }
}

/** True when Judge0 CE is reachable (=> có Internet, dùng online mode). */
export async function pingJudge0(timeoutMs = 3000): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(`${JUDGE0_BASE}/about`, {
      method: "GET",
      cache: "no-store",
      signal: ctl.signal,
    });
    window.clearTimeout(timer);
    // Any HTTP response (even 4xx) means the network + server are reachable.
    return res.status > 0;
  } catch {
    return false;
  }
}

/** Run C++ code on Judge0 CE and map the submission into a CompileResult. */
export async function runJudge0(
  code: string,
  stdin: string,
  _cppVersion: string,
): Promise<CompileResult> {
  try {
    return await runJudge0Direct(code, stdin);
  } catch (error) {
    // On the web, a direct Judge0 call can still fail (CSP, ad-blockers,
    // rate limits). Retry through the ide.ankb API, which proxies Judge0 CE
    // server-side. The desktop app keeps the direct error so its native
    // g++ fallback path can take over instead.
    if (isTauriRuntime()) throw error;
    try {
      return await runViaApi(code, stdin);
    } catch {
      throw error;
    }
  }
}

async function runJudge0Direct(
  code: string,
  stdin: string,
): Promise<CompileResult> {
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 60000);

  let res: Response;
  try {
    res = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true&wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: b64enc(code),
        language_id: CPP_LANGUAGE_ID,
        stdin: b64enc(stdin || ""),
      }),
      signal: ctl.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Judge0 HTTP ${res.status}`);
  }

  const data = await res.json();
  const stdout = b64dec(data.stdout);
  const stderr = b64dec(data.stderr);
  const compileOutput = b64dec(data.compile_output);
  const message = b64dec(data.message);
  const statusId: number = data?.status?.id ?? 0;
  const statusDesc: string = data?.status?.description ?? "";
  const duration =
    data.time != null ? Number(data.time) * 1000 : performance.now() - t0;
  const memoryKb = data.memory != null ? Number(data.memory) : undefined;

  const base: Omit<CompileResult, "success" | "stage" | "stdout" | "stderr" | "compile_error" | "exit_code" | "timed_out"> =
    {
      duration_ms: duration,
      signal: null,
      compiler_used: "Judge0 CE (g++ online)",
      memory_kb: memoryKb,
      engine: "judge0",
    };

  // 6 = Compilation Error
  if (statusId === 6 || (compileOutput && compileOutput.trim())) {
    return {
      ...base,
      success: false,
      stage: "compile",
      stdout,
      stderr,
      compile_error: compileOutput || stderr || "Compilation failed",
      exit_code: null,
      timed_out: false,
    };
  }

  // 5 = Time Limit Exceeded
  if (statusId === 5) {
    return {
      ...base,
      success: false,
      stage: "run",
      stdout,
      stderr: stderr || statusDesc || "Time Limit Exceeded",
      compile_error: "",
      exit_code: null,
      timed_out: true,
      signal: "TLE",
    };
  }

  // 3 = Accepted. 7..12 = runtime errors, 4 = Wrong Answer (n/a, no expected output sent)
  const ok = statusId === 3 || statusId === 4;
  return {
    ...base,
    success: ok,
    stage: "run",
    stdout,
    stderr: stderr || message || (ok ? "" : statusDesc),
    compile_error: "",
    exit_code: ok ? 0 : statusId || 1,
    timed_out: false,
    signal: ok ? null : statusDesc || null,
  };
}

/**
 * Run code through the ide.ankb HTTP API (same origin on the web build).
 * The endpoint proxies Judge0 CE server-side (plus an optional private
 * backend), so it works even when ce.judge0.com is unreachable from the
 * browser. Response shape mirrors CompileResult.
 */
async function runViaApi(code: string, stdin: string): Promise<CompileResult> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 60000);
  let res: Response;
  try {
    res = await fetch(API_RUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, stdin, cppVersion: "17" }),
      signal: ctl.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok && res.status !== 200) {
    let detail = `API HTTP ${res.status}`;
    try {
      const payload = await res.json();
      if (payload?.error) detail = `${detail}: ${payload.error}`;
    } catch { /* body was not JSON — keep the status line */ }
    throw new Error(detail);
  }

  const data = await res.json();
  const compileOutput = String(data.compile_error || "");
  return {
    success: Boolean(data.success),
    stage: data.stage === "compile" || data.stage === "run" ? data.stage : "run",
    stdout: String(data.stdout || ""),
    stderr: String(data.stderr || ""),
    compile_error: compileOutput,
    duration_ms: data.time != null ? Number(data.time) * 1000 : 0,
    exit_code: data.exit_code ?? null,
    timed_out: Boolean(data.timed_out) || data.judge0Status === "Time Limit Exceeded",
    signal: data.timed_out ? "TLE" : null,
    compiler_used: "Judge0 CE (via ide.ankb API)",
    memory_kb: data.memory != null ? Number(data.memory) : undefined,
    engine: "judge0",
  };
}
