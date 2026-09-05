/**
 * Build the web bundle of the desktop UI and install it into ../public/.
 *
 * The website (ide.ankb.qzz.io, Cloudflare Pages) is deployed WITHOUT a build
 * command, so the compiled assets must be committed. This script:
 *   1. runs `vite build --config vite.web.config.ts` into desktop/dist-web/
 *   2. removes the retired vanilla web app (app.js/config.js/security.js)
 *      and any stale hashed assets from a previous web build
 *   3. copies dist-web/index.html + dist-web/app/** into public/
 *
 * Run from desktop/:  npm run build:web
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const desktopDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(desktopDir, "..");
const stagingDir = path.join(desktopDir, "dist-web");
const publicDir = path.join(repoRoot, "public");

execSync('npx vite build --config vite.web.config.ts', { cwd: desktopDir, stdio: "inherit" });

if (!fs.existsSync(path.join(stagingDir, "index.html"))) {
  console.error("vite did not produce index.html in dist-web/");
  process.exit(1);
}

// Retired vanilla web app files (replaced by the desktop React UI).
for (const retired of ["app.js", "config.js", "security.js"]) {
  const target = path.join(publicDir, retired);
  if (fs.existsSync(target)) fs.rmSync(target);
}

// Stale hashed assets from a previous web build.
const publicAppDir = path.join(publicDir, "app");
if (fs.existsSync(publicAppDir)) fs.rmSync(publicAppDir, { recursive: true });

fs.cpSync(path.join(stagingDir, "app"), publicAppDir, { recursive: true });
fs.copyFileSync(path.join(stagingDir, "index.html"), path.join(publicDir, "index.html"));

const files = fs.readdirSync(publicAppDir);
console.log(`Installed web bundle into ${path.relative(repoRoot, publicDir)} (${files.length} asset files)`);
for (const file of files) console.log(`  - app/${file}`);
