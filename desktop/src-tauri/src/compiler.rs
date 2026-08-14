// CP IDE - C++ Compiler Module
// Supports: GCC, Clang, MSVC

use serde::{Deserialize, Serialize};
use std::process::Command;
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
        _ => format!("-std=c++17"),
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

/// Well-known install locations of MinGW-w64 / WinLibs / MSYS2 on Windows.
/// Users often install GCC there without adding it to PATH.
#[cfg(target_os = "windows")]
fn find_gcc_in_known_paths() -> Option<String> {
    let mut candidates: Vec<std::path::PathBuf> = vec![
        r"C:\msys64\ucrt64\bin\g++.exe".into(),
        r"C:\msys64\mingw64\bin\g++.exe".into(),
        r"C:\msys64\clang64\bin\g++.exe".into(),
        r"C:\mingw64\bin\g++.exe".into(),
        r"C:\mingw32\bin\g++.exe".into(),
        r"C:\MinGW\bin\g++.exe".into(),
        r"C:\TDM-GCC-64\bin\g++.exe".into(),
        r"C:\TDM-GCC-32\bin\g++.exe".into(),
        r"C:\Program Files\CodeBlocks\MinGW\bin\g++.exe".into(),
        r"C:\Program Files (x86)\CodeBlocks\MinGW\bin\g++.exe".into(),
        r"C:\Program Files (x86)\Dev-Cpp\MinGW64\bin\g++.exe".into(),
        r"C:\Strawberry\c\bin\g++.exe".into(),
    ];
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let home = std::path::Path::new(&profile);
        candidates.push(home.join(r"scoop\apps\gcc\current\bin\g++.exe"));
        candidates.push(home.join(r"scoop\apps\mingw\current\bin\g++.exe"));
        candidates.push(home.join(r"scoop\apps\mingw-winlibs\current\bin\g++.exe"));
        candidates.push(home.join(r"scoop\apps\mingw-winlibs-llvm-ucrt\current\bin\g++.exe"));
    }
    candidates
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
}

#[cfg(not(target_os = "windows"))]
fn find_gcc_in_known_paths() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn find_clang_in_known_paths() -> Option<String> {
    let candidates: Vec<std::path::PathBuf> = vec![
        r"C:\Program Files\LLVM\bin\clang++.exe".into(),
        r"C:\msys64\clang64\bin\clang++.exe".into(),
        r"C:\msys64\ucrt64\bin\clang++.exe".into(),
    ];
    candidates
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
}

#[cfg(not(target_os = "windows"))]
fn find_clang_in_known_paths() -> Option<String> {
    None
}

fn gcc_not_found_message() -> String {
    if cfg!(target_os = "windows") {
        [
            "Không tìm thấy GCC (g++) trên máy.",
            "",
            "Cách cài nhanh nhất — mở PowerShell và chạy:",
            "    winget install --id BrechtSanders.WinLibs.POSIX.UCRT",
            "sau đó KHỞI ĐỘNG LẠI CP IDE để nhận PATH mới.",
            "",
            "Hoặc cài MSYS2 (https://www.msys2.org) rồi chạy:",
            "    pacman -S mingw-w64-ucrt-x86_64-gcc",
            "",
            "Nếu đã cài GCC rồi: thêm thư mục chứa g++.exe vào PATH",
            "(vd: C:\\msys64\\ucrt64\\bin) rồi mở lại CP IDE.",
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
            "Không tìm thấy Clang (clang++) trên máy.",
            "",
            "Cách cài nhanh — mở PowerShell và chạy:",
            "    winget install --id LLVM.LLVM",
            "sau đó KHỞI ĐỘNG LẠI CP IDE để nhận PATH mới.",
        ]
        .join("\n")
    } else if cfg!(target_os = "macos") {
        "Không tìm thấy Clang (clang++). Cài đặt: xcode-select --install hoặc brew install llvm".to_string()
    } else {
        "Không tìm thấy Clang (clang++). Cài đặt: sudo apt install clang".to_string()
    }
}

fn find_compiler(compiler: &str) -> Result<String, String> {
    match compiler {
        "gcc" => {
            // Try g++ on PATH first, then versioned names, then known install dirs.
            for name in &["g++", "g++-15", "g++-14", "g++-13", "g++-12", "g++-11"] {
                if which_exists(name) {
                    return Ok(name.to_string());
                }
            }
            if let Some(path) = find_gcc_in_known_paths() {
                return Ok(path);
            }
            Err(gcc_not_found_message())
        }
        "clang" => {
            for name in &["clang++", "clang++-19", "clang++-18", "clang++-17", "clang++-16"] {
                if which_exists(name) {
                    return Ok(name.to_string());
                }
            }
            if let Some(path) = find_clang_in_known_paths() {
                return Ok(path);
            }
            Err(clang_not_found_message())
        }
        "msvc" => {
            if which_exists("cl") {
                Ok("cl".to_string())
            } else {
                Err([
                    "Không tìm thấy MSVC (cl.exe).",
                    "",
                    "Cài Visual Studio Build Tools:",
                    "    winget install --id Microsoft.VisualStudio.2022.BuildTools",
                    "(chọn workload \"Desktop development with C++\").",
                    "Lưu ý: cl.exe chỉ có trong PATH khi mở app từ \"Developer Command Prompt\".",
                    "Khuyên dùng GCC (MinGW-w64) cho competitive programming.",
                ]
                .join("\n")
                .to_string())
            }
        }
        _ => Err(format!("Compiler không hỗ trợ: {}", compiler)),
    }
}

fn which_exists(name: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        new_command("where")
            .arg(name)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        new_command("which")
            .arg(name)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

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

    // Find compiler
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
        new_command(&compiler_path)
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
        let mut args = vec![
            std_flag.as_str(),
            "-O2",
            "-pipe",
            "-o",
        ];
        let bin_str = bin_path.to_string_lossy().to_string();
        let src_str = src_path.to_string_lossy().to_string();
        args.push(&bin_str);
        args.push(&src_str);

        // Add custom flags
        let extra_flags: Vec<&str> = flags.split_whitespace().collect();
        for f in &extra_flags {
            if !f.is_empty() && *f != "-O2" && *f != "-pipe" {
                args.push(f);
            }
        }

        new_command(&compiler_path)
            .args(&args)
            .current_dir(tmp.path())
            .output()
    };

    let compile_output = compile_output
        .map_err(|e| format!("Không thể chạy compiler: {}", e))?;

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
