/**
 * Tauri API wrappers for ide.ankb
 * Bridges React frontend with Rust backend
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Tauri invoke types
export interface CompileOptions {
  code: string;
  stdin: string;
  cppVersion: string;
  compiler: "gcc" | "clang" | "msvc";
  flags: string;
  timeout_ms?: number;
}

export interface CompileResult {
  success: boolean;
  stage: "compile" | "run" | "error";
  stdout: string;
  stderr: string;
  compile_error: string;
  duration_ms: number;
  exit_code: number | null;
  timed_out: boolean;
  signal?: string | null;
  compiler_used?: string;
  memory_kb?: number;
  /** Which engine produced this result: "judge0" (online) or "native". */
  engine?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  is_dir: boolean;
}

export interface GitStatus {
  branch: string;
  modified: string[];
  staged: string[];
  untracked: string[];
}

// Use the module API instead of window.__TAURI__. Tauri 2 disables the global
// object by default, so the old check made every native command fail in release.
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

/**
 * Compile and run C++ code using native compiler
 */
export async function compile(opts: CompileOptions): Promise<CompileResult> {
  try {
    return await invoke<CompileResult>("compile_cpp", {
      code: opts.code,
      stdin: opts.stdin,
      cppVersion: opts.cppVersion,
      compiler: opts.compiler,
      flags: opts.flags,
      timeoutMs: opts.timeout_ms || 2000,
    });
  } catch (err: any) {
    return {
      success: false,
      stage: "error",
      stdout: "",
      stderr: String(err?.message || err),
      compile_error: "",
      duration_ms: 0,
      exit_code: -1,
      timed_out: false,
    };
  }
}

/**
 * Save file to disk
 */
export async function saveFile(path: string, content: string): Promise<void> {
  await invoke("save_file", { path, content });
}

/**
 * Read file from disk
 */
export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/**
 * Open file dialog (single select)
 */
export async function openFileDialog(): Promise<string | null> {
  return invoke<string | null>("open_file_dialog");
}

/**
 * Open file dialog (multi select: cpp, c, h, txt, inp, out, ...)
 */
export async function openFilesDialog(): Promise<string[]> {
  try {
    return await invoke<string[]>("open_files_dialog");
  } catch {
    return [];
  }
}

/**
 * Save file dialog
 */
export async function saveFileDialog(defaultName: string): Promise<string | null> {
  return invoke<string | null>("save_file_dialog", { defaultName });
}

/**
 * List files in directory
 */
export async function listFiles(dir: string): Promise<FileInfo[]> {
  return invoke<FileInfo[]>("list_files", { dir });
}

/**
 * Get Git status
 */
export async function gitStatus(repoPath: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { repoPath });
}

/**
 * Git commit
 */
export async function gitCommit(repoPath: string, message: string): Promise<string> {
  return invoke<string>("git_commit", { repoPath, message });
}

/**
 * Write to PTY terminal
 */
export async function ptyWrite(data: string): Promise<void> {
  await invoke("pty_write", { data });
}

/**
 * Resize PTY terminal
 */
export async function ptyResize(cols: number, rows: number): Promise<void> {
  await invoke("pty_resize", { cols, rows });
}

/**
 * Get app config
 */
export async function getConfig(): Promise<Record<string, any>> {
  return invoke<Record<string, any>>("get_config");
}

/**
 * Save app config
 */
export async function saveConfig(config: Record<string, any>): Promise<void> {
  await invoke("save_config", { config });
}
