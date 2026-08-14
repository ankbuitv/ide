import { useState } from "react";

interface SidebarProps {
  fileName: string;
  onFileSelect: (name: string) => void;
}

export default function Sidebar({ fileName, onFileSelect }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const files = [
    { name: "main.cpp", icon: "📄", lang: "cpp" },
    { name: "input.txt", icon: "📝", lang: "text" },
    { name: "output.txt", icon: "📋", lang: "text" },
  ];

  if (collapsed) {
    return (
      <div className="sidebar collapsed">
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(false)}
          title="Mở sidebar"
        >
          📂
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>📁 Explorer</span>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(true)}
          title="Đóng sidebar"
        >
          ◀
        </button>
      </div>
      <div className="sidebar-section">
        <div className="section-title">PROJECT</div>
        {files.map((f) => (
          <div
            key={f.name}
            className={`file-item ${fileName === f.name ? "active" : ""}`}
            onClick={() => onFileSelect(f.name)}
          >
            <span className="file-icon">{f.icon}</span>
            <span className="file-name">{f.name}</span>
          </div>
        ))}
      </div>
      <div className="sidebar-section">
        <div className="section-title">SNIPPETS</div>
        <div className="snippet-item">📋 Binary Search</div>
        <div className="snippet-item">📋 Segment Tree</div>
        <div className="snippet-item">📋 Dijkstra</div>
        <div className="snippet-item">📋 BFS/DFS</div>
      </div>
    </div>
  );
}
