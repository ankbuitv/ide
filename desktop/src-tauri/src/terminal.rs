// CP IDE - PTY Terminal Module
// Cross-platform pseudo-terminal support

use std::io::Write;
use std::sync::Mutex;

static PTY_MASTER: Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>> = Mutex::new(None);
static PTY_WRITER: Mutex<Option<Box<dyn Write + Send>>> = Mutex::new(None);
static PTY_CHILD: Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>> = Mutex::new(None);

fn get_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

#[allow(dead_code)]
fn init_pty(cols: u16, rows: u16) -> Result<(), String> {
    use portable_pty::{CommandBuilder, PtySize, native_pty_system, PtySystem};

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("PTY init failed: {}", e))?;

    let shell = get_default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("PTY spawn failed: {}", e))?;

    // Writer must be taken once from the master side
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("PTY writer failed: {}", e))?;

    if let Ok(mut m) = PTY_MASTER.lock() {
        *m = Some(pair.master);
    }
    if let Ok(mut w) = PTY_WRITER.lock() {
        *w = Some(writer);
    }
    if let Ok(mut c) = PTY_CHILD.lock() {
        *c = Some(child);
    }

    Ok(())
}

#[tauri::command]
pub async fn pty_write(data: String) -> Result<(), String> {
    if let Ok(mut writer) = PTY_WRITER.lock() {
        if let Some(ref mut w) = *writer {
            w.write_all(data.as_bytes())
                .map_err(|e| format!("PTY write failed: {}", e))?;
            w.flush()
                .map_err(|e| format!("PTY flush failed: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(cols: u16, rows: u16) -> Result<(), String> {
    use portable_pty::PtySize;
    if let Ok(master) = PTY_MASTER.lock() {
        if let Some(ref m) = *master {
            m.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("PTY resize failed: {}", e))?;
        }
    }
    Ok(())
}
