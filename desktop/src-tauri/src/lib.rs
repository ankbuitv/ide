// CP IDE - Library (core logic)

mod compiler;
mod terminal;
mod database;

use tauri::Manager;

pub use compiler::{compile_cpp, CompileOptions, CompileResult};
pub use terminal::{pty_write, pty_resize};
pub use database::{init_db, save_submission, get_submissions};

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

/// Open file dialog
#[tauri::command]
async fn open_file_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog()
        .file()
        .add_filter("C++ Source", &["cpp", "cc", "cxx", "c"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    Ok(file.map(|p| p.to_string()))
}

/// Save file dialog
#[tauri::command]
async fn save_file_dialog(default_name: String) -> Result<Option<String>, String> {
    // For now return None - will implement with tauri-plugin-dialog
    Ok(None)
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
            modified: meta.modified()
                .map(|t| format!("{:?}", t))
                .unwrap_or_default(),
            is_dir: meta.is_dir(),
        });
    }

    files.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(files)
}

/// Get app config
#[tauri::command]
async fn get_config() -> Result<serde_json::Value, String> {
    let config_path = get_config_path();
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| e.to_string())?;
        let config: serde_json::Value = serde_json::from_str(&content)
            .unwrap_or(serde_json::json!({}));
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
    std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| format!("Không thể lưu config: {}", e))
}

fn get_config_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("cp-ide")
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
    // Initialize database
    if let Err(e) = init_db() {
        eprintln!("Warning: DB init failed: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            compile_cpp,
            pty_write,
            pty_resize,
            save_file,
            read_file,
            open_file_dialog,
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
