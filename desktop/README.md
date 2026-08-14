# ⚡ CP IDE — Competitive Programming Desktop IDE

Cross-platform desktop IDE for competitive programming, built with **Tauri 2 + React + TypeScript + Rust**.

![Architecture](https://img.shields.io/badge/Tauri-2.0-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Rust](https://img.shields.io/badge/Rust-2021-orange)

## 🏗️ Architecture

```
                 CP IDE
                   │
          ┌────────┴────────┐
          │                 │
     React + TS         Tauri 2
          │                 │
     Monaco Editor         Rust
                            │
          ┌─────────────────┼─────────────────┐
          ↓                 ↓                 ↓
       Windows            macOS              Linux
        .exe              .app              .AppImage
       .msi              .dmg               .deb
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **UI Framework** | React 18 + TypeScript |
| **Editor** | Monaco Editor (VS Code engine) |
| **Desktop** | Tauri 2 (WebView2/WebKitGTK) |
| **Backend** | Rust |
| **Terminal** | xterm.js + Native PTY |
| **C++ Compiler** | GCC / Clang / MSVC |
| **Database** | SQLite (rusqlite) |
| **Config** | JSON (cross-platform) |
| **Build** | GitHub Actions (CI/CD) |

## 📦 Features

- ✅ **Monaco Editor** — Same engine as VS Code, full C++ IntelliSense
- ✅ **Multi-compiler** — GCC, Clang, MSVC with version selector
- ✅ **C++11/14/17/20/23** — Standard version picker
- ✅ **Native Terminal** — PTY with xterm.js, full shell access
- ✅ **Fast Compile** — Native compilation, no server needed
- ✅ **Submission History** — SQLite database tracks all runs
- ✅ **Snippets** — Common CP patterns (binary search, segtree, etc.)
- ✅ **Test Cases** — Input/expected/actual comparison
- ✅ **Cross-platform** — Windows, macOS, Linux

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **Rust** 1.70+
- **C++ Compiler**: GCC 11+, Clang 14+, or MSVC 2022
- **System libs** (Linux only): `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`

#### Windows (bắt buộc dùng MSVC toolchain)

Trên Windows phải dùng Rust **MSVC toolchain**, không dùng GNU toolchain
(GNU sẽ lỗi `dlltool.exe not found` khi build `parking_lot_core`). Chạy:

```bash
rustup default stable-x86_64-pc-windows-msvc
```

và cài **Visual Studio Build Tools** với workload **"Desktop development with C++"**
(Desktop development with C++ → MSVC v143 + Windows 10/11 SDK).

### Install

```bash
cd desktop
npm ci
```

### Development

```bash
# Start dev server with hot reload
npm run tauri:dev
```

### Build Release

```bash
# Build production binaries
npm run tauri:build
```

Output:
- **Windows**: `src-tauri/target/release/bundle/msi/*.msi`
- **macOS**: `src-tauri/target/release/bundle/dmg/*.dmg`
- **Linux**: `src-tauri/target/release/bundle/appimage/*.AppImage`

## 🎹 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F9` / `Ctrl+Enter` | Compile & Run |
| `Ctrl+S` | Save file |
| `Ctrl+O` | Open file |
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find & Replace |
| `Ctrl+/` | Toggle comment |

## 📁 Project Structure

```
desktop/
├── src/                          # React Frontend
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Main layout
│   ├── components/
│   │   ├── Editor.tsx            # Monaco Editor wrapper
│   │   ├── Terminal.tsx          # xterm.js terminal
│   │   ├── Output.tsx            # Compile/run output
│   │   ├── StatusBar.tsx         # Bottom status bar
│   │   └── Sidebar.tsx           # File explorer
│   ├── hooks/                    # Custom React hooks
│   ├── lib/
│   │   └── tauri.ts             # Tauri API bridge
│   ├── styles/
│   │   ├── global.css           # Global styles
│   │   └── App.css              # App layout styles
│   └── types/
│       └── index.ts             # TypeScript types
│
├── src-tauri/                   # Rust Backend
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri configuration
│   ├── capabilities/           # Permission config
│   └── src/
│       ├── main.rs             # Entry point
│       ├── lib.rs              # Tauri commands registry
│       ├── compiler.rs         # C++ compile & run (GCC/Clang/MSVC)
│       ├── terminal.rs         # Native PTY terminal
│       └── database.rs         # SQLite storage

├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🔧 Configuration

Config file: `%APPDATA%/cp-ide/config.json` (Windows) or `~/.config/cp-ide/config.json` (Linux/macOS)

```json
{
  "compiler": "gcc",
  "cppVersion": "17",
  "flags": "-O2 -pipe",
  "timeout": 2000,
  "theme": "vs-dark",
  "fontSize": 14,
  "tabSize": 4,
  "minimap": true
}
```

## 📦 Release Builds (GitHub Actions)

Push a tag `v*` to trigger multi-platform builds:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Auto-builds:
- ✅ Windows: `.exe` + `.msi`
- ✅ macOS: `.app` + `.dmg` (Intel + Apple Silicon)
- ✅ Linux: `.AppImage` + `.deb`

## 📄 License

MIT © [ankbuitv](https://github.com/ankbuitv)
