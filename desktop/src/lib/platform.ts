/**
 * Runtime platform detection shared by the desktop (Tauri) and web builds.
 *
 * The exact same React bundle powers both:
 *  - desktop: Tauri WebView (release builds serve dist/ from the app binary)
 *  - web:     ide.ankb.qzz.io (Cloudflare Pages, static bundle in public/)
 */

/** Canonical web deployment — also used by the desktop app as its OJ proxy. */
export const WEB_API_BASE = "https://ide.ankb.qzz.io";

/** True when running inside the Tauri shell (desktop app). */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

/**
 * Base URL for the ide.ankb HTTP API.
 *  - web:     same origin ("/api/...")
 *  - desktop: the public site (only needed for CORS-restricted proxies)
 */
export function apiBaseUrl(): string {
  return isTauriRuntime() ? WEB_API_BASE : "";
}
