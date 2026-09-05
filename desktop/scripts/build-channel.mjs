import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const channel = process.argv[2] || "standard";
const channels = {
  standard: {
    productName: "ide.ankb",
    identifier: "com.ankb.ide",
    versionSuffix: "",
    title: "ide.ankb — C++ IDE",
    folder: "ide.ankb",
    description: "Stable desktop release",
  },
  beta: {
    productName: "ide.ankb Beta",
    identifier: "com.ankb.ide.beta",
    // Numeric-only prerelease: WiX (MSI bundler) rejects non-numeric
    // identifiers like "beta.1" ("must be numeric-only ... for msi target").
    versionSuffix: "-1",
    title: "ide.ankb Beta — C++ IDE",
    folder: "ide.ankb Beta",
    description: "Early-access desktop release",
  },
  nightly: {
    productName: "ide.ankb Nightly",
    identifier: "com.ankb.ide.nightly",
    // Numeric-only prerelease, see beta.
    versionSuffix: "-2",
    title: "ide.ankb Nightly — VIP Pro Lab",
    folder: "ide.ankb Nightly",
    description: "Experimental VIP Pro desktop release",
  },
};

if (!channels[channel]) {
  console.error(`Unknown channel: ${channel}. Use standard, beta or nightly.`);
  process.exit(1);
}

const desktopDir = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(desktopDir, "src-tauri", "tauri.conf.json");
const outputPath = path.join(desktopDir, "src-tauri", `tauri.${channel}.generated.json`);
const base = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const meta = channels[channel];
const config = structuredClone(base);

config.productName = meta.productName;
config.identifier = meta.identifier;
const tagVersion = process.env.GITHUB_REF_NAME?.match(/^v?(\d+\.\d+\.\d+)/)?.[1];
const stableVersion = tagVersion || process.env.APP_VERSION || base.version;
config.version = `${stableVersion}${meta.versionSuffix}`;
config.app.windows = config.app.windows.map((window) => ({
  ...window,
  title: meta.title,
}));
config.bundle.windows.nsis = {
  ...config.bundle.windows.nsis,
  startMenuFolder: meta.folder,
};
config.bundle.shortDescription = `ide.ankb — ${meta.description}`;
config.bundle.longDescription = `${base.bundle.longDescription} Channel: ${channel}.`;

fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Generated ${path.relative(desktopDir, outputPath)} for ${channel}`);
console.log(`Product: ${meta.productName}`);
console.log(`Identifier: ${meta.identifier}`);
console.log(`Version: ${config.version}`);
