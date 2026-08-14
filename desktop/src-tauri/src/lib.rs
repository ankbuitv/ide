// ide.ankb — Library (core logic)

mod compiler;
mod terminal;
mod database;

pub use compiler::{compile_cpp, CompileResult};
pub use terminal::{pty_write, pty_resize};
pub use database::{init_db, save_submission, get_submissions};

use tauri::Manager;

/// Suppress Windows hard-error message boxes ("cc1plus.exe - System Error:
/// libgmp-10.dll was not found ...") process-wide. Child processes inherit
/// this error mode, so broken toolchains fail silently in code instead of
/// popping modal system dialogs that block the compile pipeline.
#[cfg(target_os = "windows")]
fn silence_hard_error_popups() {
    #[link(name = "kernel32")]
    extern "system" {
        fn SetErrorMode(mode: u32) -> u32;
    }
    const SEM_FAILCRITICALERRORS: u32 = 0x0001;
    const SEM_NOGPFAULTERRORBOX: u32 = 0x0002;
    const SEM_NOOPENFILEERRORBOX: u32 = 0x8000;
    unsafe {
        SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
    }
}

#[cfg(not(target_os = "windows"))]
fn silence_hard_error_popups() {}

/// Save file to disk
#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Không thể lưu file: {}", e))
}

/// Read file from disk
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Không thể đọc file: {}", e))
}

/// Open file dialog (single file, kept for compatibility)
#[tauri::command]
async fn open_file_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .add_filter("C/C++ Source", &["cpp", "cc", "cxx", "c++", "c", "h", "hpp", "hh"])
        .add_filter("Text & Data", &["txt", "inp", "out", "ans", "csv", "json", "md"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    Ok(file.map(|p| p.to_string()))
}

/// Open file dialog — multi-select: cpp, c, h, txt, inp, out, ...
#[tauri::command]
async fn open_files_dialog(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app
        .dialog()
        .file()
        .add_filter("C/C++ Source", &["cpp", "cc", "cxx", "c++", "c", "h", "hpp", "hh"])
        .add_filter("Text & Data", &["txt", "inp", "out", "ans", "csv", "json", "md"])
        .add_filter("All Files", &["*"])
        .blocking_pick_files();

    Ok(files
        .map(|list| list.iter().map(|p| p.to_string()).collect())
        .unwrap_or_default())
}

/// Save file dialog
#[tauri::command]
async fn save_file_dialog(
    app: tauri::AppHandle,
    default_name: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("C/C++ Source", &["cpp", "cc", "cxx", "c++", "c", "h", "hpp", "hh"])
        .add_filter("Text & Data", &["txt", "inp", "out", "ans", "csv", "json", "md"])
        .add_filter("All Files", &["*"])
        .blocking_save_file();

    Ok(file.map(|p| p.to_string()))
}

/// List files in directory
#[tauri::command]
async fn list_files(dir: String) -> Result<Vec<compiler::FileInfo>, String> {
    let mut files = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Không thể đọc thư mục: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        files.push(compiler::FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            size: meta.len(),
            modified: meta
                .modified()
                .map(|t| format!("{:?}", t))
                .unwrap_or_default(),
            is_dir: meta.is_dir(),
        });
    }

    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));

    Ok(files)
}

/// Get app config
#[tauri::command]
async fn get_config() -> Result<serde_json::Value, String> {
    let config_path = get_config_path();
    if config_path.exists() {
        let content =
            std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let config: serde_json::Value =
            serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
        Ok(config)
    } else {
        Ok(default_config())
    }
}

/// Save app config
#[tauri::command]
async fn save_config(config: serde_json::Value) -> Result<(), String> {
    let config_path = get_config_path();
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        &config_path,
        serde_json::to_string_pretty(&config).unwrap(),
    )
    .map_err(|e| format!("Không thể lưu config: {}", e))
}

fn get_config_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ide-ankb")
        .join("config.json")
}

fn default_config() -> serde_json::Value {
    serde_json::json!({
        "compiler": "gcc",
        "cppVersion": "17",
        "flags": "-O2 -pipe",
        "timeout": 2000,
        "theme": "vs-dark",
        "fontSize": 14,
        "tabSize": 4,
        "minimap": true
    })
}

pub fn run() {
    // Never let a broken toolchain show Windows "System Error" dialogs.
    silence_hard_error_popups();

    // Initialize database
    if let Err(e) = init_db() {
        eprintln!("Warning: DB init failed: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Auto-maximize the main window on launch.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            compile_cpp,
            pty_write,
            pty_resize,
            save_file,
            read_file,
            open_file_dialog,
            open_files_dialog,
            save_file_dialog,
            list_files,
            get_config,
            save_config,
            save_submission,
            get_submissions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
