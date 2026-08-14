# ide.ankb — C++ Desktop IDE

Desktop IDE for competitive programming (branded **ide.ankb**, same logo & context menu as the web version), built with **Tauri 2 + React + TypeScript + Rust**.

![Architecture](https://img.shields.io/badge/Tauri-2.0-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Rust](https://img.shields.io/badge/Rust-2021-orange)

## 🏗️ Architecture

```
                ide.ankb
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
| **Online engine** | Judge0 CE (khi có Internet) |
| **Offline engine** | g++ / clang++ / MSVC nội bộ |
| **Database** | SQLite (rusqlite) |
| **Config** | JSON (cross-platform) |

## 📦 Features

- ✅ **Engine Auto**: có Internet → chạy bằng **Judge0 CE**; offline/lỗi mạng → tự chuyển **Native** (có thể ép tay trong menu Run)
- ✅ **Compiler thông minh**: tự tìm g++ trong PATH → Code::Blocks → MSYS2/WinLibs/TDM/Dev-C++ → quét sâu toàn ổ; **verify bằng cách compile thử thật** nên compiler hỏng (thiếu `libgmp-10.dll`, `libgcc_s_seh-1.dll`…) bị bỏ qua, **không còn popup "System Error"**
- ✅ **Context menu y chang bản web** — Run, Format, Reset, Open/Download, Clear/Copy Output, Reload, About — mọi item đều hoạt động
- ✅ **Multi-file tabs** — mở nhiều file `cpp/c/h/hpp/txt/inp/out/ans...` cùng lúc; input trống thì tự lấy từ tab `.inp`, stdout đổ vào tab `.out`
- ✅ **Menu bar hoạt động thật** — File/Edit/View/Run/Help, tất cả đều nhấn là chạy
- ✅ **Auto maximize** khi mở app
- ✅ **Monaco Editor** — Same engine as VS Code + C++ snippets + Format Document
- ✅ **C++11/14/17/20/23** — Standard version picker (native), Judge0 dùng GCC 9.4 (C++17/gnu17+)
- ✅ **Auto-save session** — mở lại app là khôi phục tabs

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **Rust** 1.70+
- **C++ Compiler** (chỉ cần khi chạy offline): GCC 11+, Clang 14+, hoặc MSVC 2022 — app tự tìm trong `C:\Program Files\CodeBlocks\MinGW\bin`, MSYS2, ... hoặc cài nhanh: `winget install --id BrechtSanders.WinLibs.POSIX.UCRT`
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
- **Windows**: `src-tauri/target/release/bundle/nsis/ide.ankb_*_x64-setup.exe` + `bundle/msi/*.msi`
- **macOS**: `src-tauri/target/release/bundle/dmg/*.dmg`
- **Linux**: `src-tauri/target/release/bundle/appimage/*.AppImage`

## 🎹 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F9` / `Ctrl+Enter` | Compile & Run |
| `Ctrl+O` | Open file(s) |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save As |
| `Ctrl+N` / `Ctrl+W` | New tab / Close tab |
| `F11` | Fullscreen |
| `Ctrl+Shift+P` / `F1` | Command Palette |
| `Ctrl+F` / `Ctrl+H` | Find / Replace |
| Chuột phải | Context menu ide.ankb (giống bản web) |

## 📁 Project Structure

```
desktop/
├── src/                          # React Frontend
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Main layout (tabs, engine, menus)
│   ├── components/
│   │   ├── Editor.tsx            # Monaco wrapper + C++ formatter
│   │   ├── Output.tsx            # Compile/run output
│   │   ├── ContextMenu.tsx       # Chuột phải — y chang bản web
│   │   ├── MenuBar.tsx           # File/Edit/View/Run/Help dropdown
│   │   ├── Terminal.tsx          # xterm.js terminal
│   │   ├── StatusBar.tsx         # Bottom status bar
│   │   └── Sidebar.tsx           # File explorer
│   ├── lib/
│   │   ├── tauri.ts              # Tauri API bridge (native engine)
│   │   └── judge0.ts            # Judge0 CE engine (online)
│   ├── styles/
│   │   ├── global.css
│   │   └── App.css
│   └── types/
│       └── index.ts
│
├── src-tauri/                   # Rust Backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/            # Permission config
│   └── src/
│       ├── main.rs
│       ├── lib.rs               # Commands + maximize + SetErrorMode
│       ├── compiler.rs          # Compiler probing/verify/compile/run
│       ├── terminal.rs          # Native PTY terminal
│       └── database.rs          # SQLite storage
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🔧 Configuration

Config file: `%APPDATA%/ide-ankb/config.json` (Windows) hoặc `~/.config/ide-ankb/config.json` (Linux/macOS)

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
git tag v1.1.0
git push origin v1.1.0
```

Auto-builds:
- ✅ Windows: `.exe` + `.msi`
- ✅ macOS: `.app` + `.dmg` (Intel + Apple Silicon)
- ✅ Linux: `.AppImage` + `.deb`

## 📄 License

MIT © [ankbuitv](https://github.com/ankbuitv)
