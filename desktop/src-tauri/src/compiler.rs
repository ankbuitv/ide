// ide.ankb — C++ Compiler Module (native engine, offline)
// Supports: GCC, Clang, MSVC
//
// Fixes the classic Windows "cc1plus.exe - System Error: libgmp-10.dll /
// libgcc_s_seh-1.dll was not found" problem:
//   1. Every candidate compiler is VERIFIED by compiling+running a tiny probe
//      program before it is used. Broken installs (missing DLLs) are skipped.
//   2. The compiler's own directory is prepended to PATH when spawning it, so
//      helper tools (cc1plus, as, ld) and their DLL dependencies resolve.
//   3. Hard-error popups are disabled process-wide in lib.rs (SetErrorMode).
//   4. Output binaries are linked statically (-static-libgcc/-static-libstdc++/
//      -static) so the produced exe never asks for libstdc++-6.dll etc.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tempfile::TempDir;

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct CompileOptions {
    code: String,
    stdin: String,
    #[serde(rename = "cppVersion")]
    cpp_version: String,
    compiler: String,
    flags: String,
    #[serde(rename = "timeoutMs")]
    timeout_ms: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct CompileResult {
    pub success: bool,
    pub stage: String,
    pub stdout: String,
    pub stderr: String,
    pub compile_error: String,
    pub duration_ms: f64,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub signal: Option<String>,
    pub compiler_used: Option<String>,
    pub memory_kb: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
    pub is_dir: bool,
}

fn get_std_flag(compiler: &str, version: &str) -> String {
    match compiler {
        "gcc" | "clang" => format!("-std=c++{}", version),
        "msvc" => format!("/std:c++{}", version),
        _ => "-std=c++17".to_string(),
    }
}

/// Create a Command that never flashes a console window on Windows.
fn new_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Build a Command for the compiler with its own directory prepended to PATH.
/// cc1plus / as / ld and DLLs such as libgmp-10.dll, libmpfr-6.dll ... usually
/// sit next to g++.exe — this makes them resolvable even when the system PATH
/// does not contain the toolchain directory.
fn compiler_command(program: &str) -> Command {
    let mut cmd = new_command(program);
    if let Some(dir) = Path::new(program).parent() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let current = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{}{}{}", dir.display(), sep, current));
    }
    cmd
}

// ---------------------------------------------------------------------------
// Compiler discovery
// ---------------------------------------------------------------------------

/// Cache of the first verified-working compiler per kind ("gcc", "clang",
/// "msvc") so the (expensive) verification only runs once per app session.
static VERIFIED_COMPILERS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn verified_cache() -> &'static Mutex<HashMap<String, String>> {
    VERIFIED_COMPILERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Locate executables by name using the OS resolver (where/which).
/// Returns every match (one per line on Windows), not just the first.
fn which_paths(name: &str) -> Vec<String> {
    let tool = if cfg!(windows) { "where" } else { "which" };
    let out = new_command(tool).arg(name).output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn push_if_exists(list: &mut Vec<String>, path: PathBuf) {
    if path.exists() {
        list.push(path.to_string_lossy().to_string());
    }
}

/// Well-known install locations of MinGW-w64 / WinLibs / MSYS2 / Code::Blocks
/// on Windows. Users often install GCC there without adding it to PATH.
#[cfg(target_os = "windows")]
fn known_gcc_paths() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = vec![
        // Code::Blocks bundled toolchains first (per user request)
        r"C:\Program Files\CodeBlocks\MinGW\bin\g++.exe".into(),
        r"C:\Program Files (x86)\CodeBlocks\MinGW\bin\g++.exe".into(),
        r"C:\CodeBlocks\MinGW\bin\g++.exe".into(),
        r"C:\Program Files\CodeBlocks\crosscompilers\MinGW\bin\g++.exe".into(),
        r"C:\Program Files (x86)\CodeBlocks\crosscompilers\MinGW\bin\g++.exe".into(),
        // MSYS2 / WinLibs / TDM / Dev-C++ / Strawberry Perl
        r"C:\msys64\ucrt64\bin\g++.exe".into(),
        r"C:\msys64\mingw64\bin\g++.exe".into(),
        r"C:\msys64\clang64\bin\g++.exe".into(),
        r"C:\msys64\mingw32\bin\g++.exe".into(),
        r"C:\mingw64\bin\g++.exe".into(),
        r"C:\mingw32\bin\g++.exe".into(),
        r"C:\MinGW\bin\g++.exe".into(),
        r"C:\winlibs\bin\g++.exe".into(),
        r"C:\TDM-GCC-64\bin\g++.exe".into(),
        r"C:\TDM-GCC-32\bin\g++.exe".into(),
        r"C:\Program Files (x86)\Dev-Cpp\MinGW64\bin\g++.exe".into(),
        r"C:\Dev-Cpp\MinGW64\bin\g++.exe".into(),
        r"C:\Strawberry\c\bin\g++.exe".into(),
        r"C:\Program Files\mingw-w64\bin\g++.exe".into(),
    ];
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let home = Path::new(&profile);
        candidates.push(home.join(r"scoop\apps\gcc\current\bin\g++.exe"));
        candidates.push(home.join(r"scoop\apps\mingw\current\bin\g++.exe"));
        candidates.push(home.join(r"scoop\apps\mingw-winlibs\current\bin\g++.exe"));
        candidates.push(home.join(r"scoop\apps\mingw-winlibs-llvm-ucrt\current\bin\g++.exe"));
    }
    candidates
}

#[cfg(not(target_os = "windows"))]
fn known_gcc_paths() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn known_clang_paths() -> Vec<PathBuf> {
    vec![
        r"C:\Program Files\LLVM\bin\clang++.exe".into(),
        r"C:\Program Files (x86)\LLVM\bin\clang++.exe".into(),
        r"C:\msys64\clang64\bin\clang++.exe".into(),
        r"C:\msys64\ucrt64\bin\clang++.exe".into(),
    ]
}

#[cfg(not(target_os = "windows"))]
fn known_clang_paths() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn known_msvc_hints() -> Vec<PathBuf> {
    // cl.exe usually lives under VS install dirs with deep versioned paths;
    // the deep scan (below) discovers it only when cheap, otherwise the user
    // is expected to run from a Developer Command Prompt.
    Vec::new()
}

#[cfg(not(target_os = "windows"))]
fn known_msvc_hints() -> Vec<PathBuf> {
    Vec::new()
}

/// Bounded recursive scan ("tự tìm tiếp") for a compiler executable under a
/// few sensible roots. Depth- and visit-capped so it stays fast even on big
/// drives. Only used when PATH + well-known locations found nothing healthy.
#[cfg(target_os = "windows")]
fn deep_scan(targets: &[&str]) -> Vec<String> {
    struct State {
        found: Vec<String>,
        visited: usize,
    }
    fn walk(dir: &Path, targets: &[&str], depth: u8, st: &mut State) {
        const MAX_FOUND: usize = 16;
        const MAX_VISITED: usize = 6000;
        if depth == 0 || st.found.len() >= MAX_FOUND || st.visited >= MAX_VISITED {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            if st.found.len() >= MAX_FOUND || st.visited >= MAX_VISITED {
                break;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let path = entry.path();
            let is_dir = path.is_dir();
            if is_dir {
                match name.as_str() {
                    // Never useful, huge, or virtual — skip.
                    "windows" | "$recycle.bin" | "system volume information" | "recovery"
                    | "programdata" | "appdata" | "node_modules" | ".git" | "perflogs" => continue,
                    _ => {}
                }
                st.visited += 1;
                walk(&path, targets, depth - 1, st);
            } else if targets.iter().any(|t| name == *t) {
                st.found.push(path.to_string_lossy().to_string());
            }
        }
    }

    let mut st = State { found: Vec::new(), visited: 0 };
    let mut roots: Vec<(PathBuf, u8)> = vec![
        (PathBuf::from(r"C:\Program Files"), 3),
        (PathBuf::from(r"C:\Program Files (x86)"), 3),
        (PathBuf::from(r"C:\"), 2),
        (PathBuf::from(r"D:\"), 2),
    ];
    if let Ok(profile) = std::env::var("USERPROFILE") {
        roots.push((PathBuf::from(profile), 3));
    }
    for (root, depth) in roots {
        if root.exists() {
            walk(&root, targets, depth, &mut st);
        }
    }
    st.found
}

#[cfg(not(target_os = "windows"))]
fn deep_scan(_targets: &[&str]) -> Vec<String> {
    Vec::new()
}

/// Push a candidate path onto `out` after normalizing and de-duplicating
/// (case-insensitively, so `C:\MinGW\bin\g++.EXE` and `c:\mingw\bin\g++.exe`
/// collapse into one entry).
fn push_unique(out: &mut Vec<String>, p: String) {
    let norm = p.trim().trim_matches('"').to_string();
    if !norm.is_empty() && !out.iter().any(|e| e.eq_ignore_ascii_case(&norm)) {
        out.push(norm);
    }
}

/// Collect every candidate for a compiler kind, best-first:
/// PATH results → environment overrides → well-known install dirs
/// (Code::Blocks first) → bounded deep scan.
fn compiler_candidates(compiler: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();

    match compiler {
        "gcc" => {
            for name in &["g++", "g++-15", "g++-14", "g++-13", "g++-12", "g++-11"] {
                for p in which_paths(name) {
                    push_unique(&mut out, p);
                }
            }
            if let Ok(custom) = std::env::var("IDE_ANKB_GXX") {
                push_unique(&mut out, custom);
            }
            if let Ok(custom) = std::env::var("CXX") {
                push_unique(&mut out, custom);
            }
            for p in known_gcc_paths() {
                if p.exists() {
                    push_unique(&mut out, p.to_string_lossy().to_string());
                }
            }
            if out.is_empty() {
                for p in deep_scan(&["g++.exe"]) {
                    push_unique(&mut out, p);
                }
            }
        }
        "clang" => {
            for name in &["clang++", "clang++-19", "clang++-18", "clang++-17", "clang++-16"] {
                for p in which_paths(name) {
                    push_unique(&mut out, p);
                }
            }
            if let Ok(custom) = std::env::var("IDE_ANKB_CLANGXX") {
                push_unique(&mut out, custom);
            }
            for p in known_clang_paths() {
                if p.exists() {
                    push_unique(&mut out, p.to_string_lossy().to_string());
                }
            }
            if out.is_empty() {
                for p in deep_scan(&["clang++.exe"]) {
                    push_unique(&mut out, p);
                }
            }
        }
        "msvc" => {
            for p in which_paths("cl") {
                push_unique(&mut out, p);
            }
            for p in known_msvc_hints() {
                if p.exists() {
                    push_unique(&mut out, p.to_string_lossy().to_string());
                }
            }
        }
        _ => {}
    }
    out
}

// ---------------------------------------------------------------------------
// Compiler verification — kills the libgmp-10.dll / libgcc_s_seh-1.dll problem
// ---------------------------------------------------------------------------

const PROBE_SOURCE: &str = "#include <iostream>\n#include <vector>\n#include <algorithm>\nint main(){std::vector<int>v{3,1,2};std::sort(v.begin(),v.end());std::cout<<\"ANKB_OK\";return 0;}\n";

/// Returns Ok(()) when `program` can really compile and run; Err(reason) when
/// the toolchain is broken (missing DLLs, missing cc1plus, bad includes, ...).
fn verify_compiler(program: &str, kind: &str) -> Result<(), String> {
    if kind != "msvc" {
        // Quick sanity: `g++ --version`. If g++.exe itself cannot start
        // (missing DLL import) this fails immediately.
        match compiler_command(program).arg("--version").output() {
            Ok(o) if o.status.success() => {}
            Ok(o) => {
                let err = String::from_utf8_lossy(&o.stderr);
                return Err(format!(
                    "không chạy được (exit {:?}){}",
                    o.status.code(),
                    if err.trim().is_empty() { String::new() } else { format!(": {}", err.lines().next().unwrap_or("")) }
                ));
            }
            Err(e) => return Err(format!("không khởi động được: {}", e)),
        }
    }

    // Real deal: compile + run a probe. This is the step that exposes broken
    // toolchains where cc1plus.exe dies with "libgmp-10.dll was not found".
    let tmp = match TempDir::new() {
        Ok(t) => t,
        Err(e) => return Err(format!("không tạo được thư mục tạm: {}", e)),
    };
    let src = tmp.path().join("probe.cpp");
    let bin = tmp.path().join(if cfg!(windows) { "probe.exe" } else { "probe" });
    if std::fs::write(&src, PROBE_SOURCE).is_err() {
        return Err("không ghi được file probe".to_string());
    }

    let output = if kind == "msvc" {
        compiler_command(program)
            .args(&[
                "/std:c++17",
                "/EHsc",
                "/nologo",
                &format!("/Fe:{}", bin.display()),
                &src.to_string_lossy(),
            ])
            .current_dir(tmp.path())
            .output()
    } else {
        let mut args: Vec<String> = vec![
            "-std=c++17".to_string(),
            "-O0".to_string(),
            "-pipe".to_string(),
            "-static-libgcc".to_string(),
            "-static-libstdc++".to_string(),
            "-o".to_string(),
            bin.to_string_lossy().to_string(),
            src.to_string_lossy().to_string(),
        ];
        if kind == "gcc" {
            args.push("-static".to_string());
        }
        let mut cmd = compiler_command(program);
        cmd.args(&args).current_dir(tmp.path());
        cmd.output()
    };

    match output {
        Err(e) => Err(format!("không chạy được compiler: {}", e)),
        Ok(o) if !o.status.success() => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            let stdout = String::from_utf8_lossy(&o.stdout);
            let msg = if stderr.trim().is_empty() { stdout } else { stderr };
            Err(format!(
                "biên dịch thử thất bại: {}",
                msg.lines().next().unwrap_or("lỗi không rõ").chars().take(160).collect::<String>()
            ))
        }
        Ok(_) => {
            if kind == "msvc" {
                return Ok(()); // good enough for MSVC
            }
            // Run the probe binary — catches broken runtime DLL resolution.
            match compiler_command(&bin.to_string_lossy()).output() {
                Ok(run) if run.status.success()
                    && String::from_utf8_lossy(&run.stdout).contains("ANKB_OK") =>
                {
                    Ok(())
                }
                Ok(run) => Err(format!(
                    "chạy thử thất bại (exit {:?})",
                    run.status.code()
                )),
                Err(e) => Err(format!("không chạy được chương trình thử: {}", e)),
            }
        }
    }
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").trim().to_string()
}

fn gcc_not_found_message() -> String {
    if cfg!(target_os = "windows") {
        [
            "Không tìm thấy GCC (g++) nào DÙNG ĐƯỢC trên máy.",
            "",
            "Cách cài nhanh nhất — mở PowerShell và chạy:",
            "    winget install --id BrechtSanders.WinLibs.POSIX.UCRT",
            "sau đó KHỞI ĐỘNG LẠI ide.ankb (Reload trong menu chuột phải).",
            "",
            "Hoặc cài Code::Blocks bản kèm MinGW (có sẵn g++ trong đó):",
            "    winget install --id CodeBlocks.CodeBlocks",
            "ide.ankb sẽ tự tìm g++ trong C:\\Program Files\\CodeBlocks\\MinGW\\bin",
            "",
            "Hoặc cài MSYS2 (https://www.msys2.org) rồi chạy:",
            "    pacman -S mingw-w64-ucrt-x86_64-gcc",
            "",
            "Mẹo: nếu CÓ Internet, app tự chạy bằng Judge0 CE, không cần cài gì.",
        ]
        .join("\n")
    } else if cfg!(target_os = "macos") {
        "Không tìm thấy GCC (g++). Cài đặt: xcode-select --install (Apple clang) hoặc brew install gcc".to_string()
    } else {
        "Không tìm thấy GCC (g++). Cài đặt: sudo apt install g++ (Ubuntu/Debian) hoặc sudo dnf install gcc-c++ (Fedora)".to_string()
    }
}

fn clang_not_found_message() -> String {
    if cfg!(target_os = "windows") {
        [
            "Không tìm thấy Clang (clang++) nào dùng được trên máy.",
            "",
            "Cách cài nhanh — mở PowerShell và chạy:",
            "    winget install --id LLVM.LLVM",
            "sau đó KHỞI ĐỘNG LẠI ide.ankb để nhận PATH mới.",
        ]
        .join("\n")
    } else if cfg!(target_os = "macos") {
        "Không tìm thấy Clang (clang++). Cài đặt: xcode-select --install hoặc brew install llvm".to_string()
    } else {
        "Không tìm thấy Clang (clang++). Cài đặt: sudo apt install clang".to_string()
    }
}

fn not_found_message(compiler: &str) -> String {
    match compiler {
        "gcc" => gcc_not_found_message(),
        "clang" => clang_not_found_message(),
        "msvc" => [
            "Không tìm thấy MSVC (cl.exe).",
            "",
            "Cài Visual Studio Build Tools:",
            "    winget install --id Microsoft.VisualStudio.2022.BuildTools",
            "(chọn workload \"Desktop development with C++\").",
            "Lưu ý: cl.exe chỉ có trong PATH khi mở app từ \"Developer Command Prompt\".",
            "Khuyên dùng GCC (MinGW-w64) cho competitive programming.",
        ]
        .join("\n"),
        other => format!("Compiler không hỗ trợ: {}", other),
    }
}

/// Resolve a usable compiler: return the cached winner when possible,
/// otherwise verify each candidate in order and cache the first healthy one.
/// Candidates that fail verification (e.g. missing libgmp-10.dll) are skipped
/// and reported in the error message when nothing works.
fn find_compiler(compiler: &str) -> Result<String, String> {
    if let Some(hit) = verified_cache().lock().unwrap().get(compiler) {
        return Ok(hit.clone());
    }

    let candidates = compiler_candidates(compiler);
    let mut tried: Vec<String> = Vec::new();
    for cand in &candidates {
        match verify_compiler(cand, compiler) {
            Ok(()) => {
                verified_cache()
                    .lock()
                    .unwrap()
                    .insert(compiler.to_string(), cand.clone());
                return Ok(cand.clone());
            }
            Err(why) => tried.push(format!("  ✗ {} — {}", cand, first_line(&why))),
        }
    }

    let mut msg = not_found_message(compiler);
    if !tried.is_empty() {
        msg.push_str("\n\nCác compiler đã tìm thấy nhưng BỎ QUA vì lỗi (thiếu DLL / hỏng):\n");
        msg.push_str(&tried.join("\n"));
        msg.push_str(
            "\n\nGợi ý: thư mục chứa g++.exe đã được tự động thêm vào PATH khi chạy, \
nhưng compiler trên vẫn lỗi — hãy cài lại MinGW đầy đủ (WinLibs/Code::Blocks) \
hoặc xóa bản hỏng khỏi PATH.",
        );
    }
    Err(msg)
}

// ---------------------------------------------------------------------------
// Compile & run
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn compile_cpp(
    code: String,
    stdin: String,
    cpp_version: String,
    compiler: String,
    flags: String,
    timeout_ms: u64,
) -> Result<CompileResult, String> {
    let start = Instant::now();

    // Find a VERIFIED working compiler (skips broken ones).
    let compiler_path = find_compiler(&compiler)?;
    let std_flag = get_std_flag(&compiler, &cpp_version);

    // Create temp directory
    let tmp = TempDir::new().map_err(|e| format!("Không thể tạo thư mục tạm: {}", e))?;
    let src_path = tmp.path().join("main.cpp");
    let bin_path = tmp.path().join(if cfg!(windows) { "main.exe" } else { "main" });
    let stdin_path = tmp.path().join("input.txt");

    // Write source and stdin
    std::fs::write(&src_path, &code).map_err(|e| format!("Không thể ghi source: {}", e))?;
    std::fs::write(&stdin_path, &stdin).map_err(|e| format!("Không thể ghi stdin: {}", e))?;

    // Compile
    let compile_output = if compiler == "msvc" {
        compiler_command(&compiler_path)
            .args(&[
                &std_flag,
                "/O2",
                "/EHsc",
                &format!("/Fe:{}", bin_path.display()),
                &src_path.to_string_lossy(),
            ])
            .current_dir(tmp.path())
            .output()
    } else {
        let mut args: Vec<String> = vec![
            std_flag,
            "-O2".to_string(),
            "-pipe".to_string(),
            // Static linking => produced exe never asks for libstdc++-6.dll,
            // libgcc_s_seh-1.dll, libwinpthread-1.dll, ...
            "-static-libgcc".to_string(),
            "-static-libstdc++".to_string(),
        ];
        if compiler == "gcc" {
            args.push("-static".to_string());
        }
        args.push("-o".to_string());
        args.push(bin_path.to_string_lossy().to_string());
        args.push(src_path.to_string_lossy().to_string());

        // Add custom flags
        for f in flags.split_whitespace() {
            if !f.is_empty() && f != "-O2" && f != "-pipe" {
                args.push(f.to_string());
            }
        }

        let mut cmd = compiler_command(&compiler_path);
        cmd.args(&args).current_dir(tmp.path());
        cmd.output()
    };

    let compile_output =
        compile_output.map_err(|e| format!("Không thể chạy compiler: {}", e))?;

    if !compile_output.status.success() {
        let stderr = String::from_utf8_lossy(&compile_output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&compile_output.stdout).to_string();
        let compile_err = if stderr.is_empty() { stdout } else { stderr };

        return Ok(CompileResult {
            success: false,
            stage: "compile".to_string(),
            stdout: String::new(),
            stderr: compile_err.clone(),
            compile_error: compile_err,
            duration_ms: start.elapsed().as_secs_f64() * 1000.0,
            exit_code: compile_output.status.code(),
            timed_out: false,
            signal: None,
            compiler_used: Some(compiler_path),
            memory_kb: None,
        });
    }

    // Run the binary
    let run_result = run_binary(&bin_path, &stdin_path, timeout_ms);
    let total_duration = start.elapsed().as_secs_f64() * 1000.0;

    let RunOutput {
        stdout,
        stderr,
        exit_code,
        timed_out,
        signal,
    } = run_result;
    let success = exit_code == Some(0) && !timed_out;
    Ok(CompileResult {
        success,
        stage: if success || exit_code.is_some() {
            "run".to_string()
        } else {
            "error".to_string()
        },
        stdout,
        stderr,
        compile_error: String::new(),
        duration_ms: total_duration,
        exit_code,
        timed_out,
        signal,
        compiler_used: Some(compiler_path),
        memory_kb: None,
    })
}

struct RunOutput {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    timed_out: bool,
    signal: Option<String>,
}

fn run_binary(bin_path: &std::path::Path, stdin_path: &std::path::Path, timeout_ms: u64) -> RunOutput {
    use std::io::Write;
    use std::process::Stdio;

    let stdin_data = std::fs::read_to_string(stdin_path).unwrap_or_default();

    let mut child = match new_command(bin_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return RunOutput {
                stdout: String::new(),
                stderr: format!("Không thể chạy binary: {}", e),
                exit_code: Some(-1),
                timed_out: false,
                signal: None,
            };
        }
    };

    // Write stdin
    if let Some(ref mut stdin) = child.stdin {
        let _ = stdin.write_all(stdin_data.as_bytes());
    }
    drop(child.stdin.take());

    // Wait with timeout
    let timeout = std::time::Duration::from_millis(timeout_ms);
    let start = Instant::now();

    // Simple polling approach for timeout
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout_buf = Vec::new();
                let mut stderr_buf = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    use std::io::Read;
                    let _ = out.read_to_end(&mut stdout_buf);
                }
                if let Some(mut err) = child.stderr.take() {
                    use std::io::Read;
                    let _ = err.read_to_end(&mut stderr_buf);
                }

                return RunOutput {
                    stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
                    stderr: String::from_utf8_lossy(&stderr_buf).to_string(),
                    exit_code: status.code(),
                    timed_out: false,
                    signal: None,
                };
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return RunOutput {
                        stdout: String::new(),
                        stderr: format!("Chương trình chạy quá {}ms (timeout)", timeout_ms),
                        exit_code: None,
                        timed_out: true,
                        signal: Some("SIGKILL".to_string()),
                    };
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(e) => {
                return RunOutput {
                    stdout: String::new(),
                    stderr: format!("Lỗi khi chạy: {}", e),
                    exit_code: Some(-1),
                    timed_out: false,
                    signal: None,
                };
            }
        }
    }
}
