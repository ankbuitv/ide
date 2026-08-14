// CP IDE - Tauri Desktop Application
// Main entry point

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cp_ide_lib::run();
}
