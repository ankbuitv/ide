import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

declare global {
  interface Window {
    __cpIdeBootTimer?: number;
  }
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CP IDE UI crashed", error, info.componentStack);
    document.body.classList.add("app-ready");
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-screen">
          <div className="fatal-card">
            <div className="fatal-icon">&lt;/&gt;</div>
            <h1>Không thể mở giao diện</h1>
            <p>CP IDE đã gặp lỗi khi khởi tạo. Hãy khởi động lại ứng dụng hoặc cài bản mới nhất.</p>
            <pre>{this.state.error.message}</pre>
            <button onClick={() => window.location.reload()}>Thử tải lại</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Keep the splash long enough to avoid a flash, then reveal the fully painted app.
window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.body.classList.add("app-ready");
      if (window.__cpIdeBootTimer) window.clearTimeout(window.__cpIdeBootTimer);
    }, 650);
  });
});
