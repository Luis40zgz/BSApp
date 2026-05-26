const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const esbuild = require("esbuild");

const rootDir = path.resolve(__dirname, "..");
const webIndexPath = path.join(rootDir, "dist", "web", "index.html");
const bundlePath = path.join(rootDir, "dist", "bundle.js");

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function main() {
  console.log("[build] Compilando React/Vite con viteSingleFile...");
  run("pnpm", ["run", "build:web"]);

  if (!fs.existsSync(webIndexPath)) {
    throw new Error(`No se ha generado el HTML esperado: ${webIndexPath}`);
  }

  console.log(
    "[build] Incrustando dist/web/index.html directamente en el bundle...",
  );
  console.log("[build] Generando bundle Node unico para BrightSign...");

  ensureDir(bundlePath);
  await esbuild.build({
    entryPoints: [path.join(rootDir, "main.js")],
    bundle: true,
    platform: "node",
    target: "node14",
    format: "cjs",
    outfile: bundlePath,
    minify: false,
    sourcemap: false,
    loader: {
      ".html": "text",
    },
  });

  console.log(`[build] OK: ${bundlePath}`);
  console.log(
    "[build] Deploy BrightSign: copiar solo dist/bundle.js como bundle.js",
  );
}

main().catch((error) => {
  console.error("[build] ERROR:", error.message);
  process.exit(1);
});
