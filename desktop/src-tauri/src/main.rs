// ide.ankb — Tauri Desktop Application
// Main entry point

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ide_ankb_lib::run();
}
