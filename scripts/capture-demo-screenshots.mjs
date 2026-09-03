import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appsDir = join(root, "apps");
const previewsDir = join(root, "assets", "demos");
const hashesPath = join(previewsDir, ".screenshot-hashes.json");
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function loadHashes() {
  try {
    return JSON.parse(await readFile(hashesPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const path = resolve(root, requested);
      if (path !== root && !path.startsWith(root + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, {
        "Content-Type": mimeTypes[extname(path).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
  return new Promise((resolveStarted, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveStarted({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function makeThumbnail(page, resizer, url, output) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1_200);

  const large = await page.screenshot({ type: "jpeg", quality: 88 });
  const thumbnail = await resizer.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 176;
    canvas.getContext("2d").drawImage(image, 0, 0, 320, 176);
    return canvas.toDataURL("image/jpeg", 0.84).split(",")[1];
  }, large.toString("base64"));
  await writeFile(output, Buffer.from(thumbnail, "base64"));
}

const appFiles = (await readdir(appsDir))
  .filter((name) => name.endsWith(".html") && name.toLowerCase() !== "index.html")
  .sort();
const moreItems = JSON.parse(await readFile(join(root, "data", "more.json"), "utf8"));
const configuredPreviews = new Map(
  moreItems
    .filter((item) => item.kind === "demo"
      && item.href?.startsWith("apps/")
      && item.thumbnail?.startsWith("assets/demos/"))
    .map((item) => [item.href.slice("apps/".length), resolve(root, item.thumbnail)])
);
const hashes = await loadHashes();
const nextHashes = {};
const pending = [];

for (const name of appFiles) {
  const source = await readFile(join(appsDir, name));
  const hash = sha256(source);
  const outputName = name.replace(/\.html$/i, ".jpg");
  const output = configuredPreviews.get(name) || join(previewsDir, outputName);
  if (!output.startsWith(previewsDir + sep)) {
    throw new Error(`Refusing to write preview outside assets/demos: ${output}`);
  }
  nextHashes[name] = hash;

  if (!force && hashes[name] === hash && await fileExists(output)) {
    console.log(`unchanged ${name}`);
  } else {
    pending.push({ name, output });
  }
}

if (dryRun) {
  for (const app of pending) {
    console.log(`would capture apps/${app.name} -> ${relative(root, app.output)}`);
  }
  process.exit(0);
}

if (pending.length) {
  const { server, baseUrl } = await startServer();
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 960, height: 528 },
      colorScheme: "light",
      reducedMotion: "no-preference"
    });
    const page = await context.newPage();
    const resizer = await context.newPage();
    for (const app of pending) {
      try {
        await makeThumbnail(
          page,
          resizer,
          `${baseUrl}/apps/${encodeURIComponent(app.name)}`,
          app.output
        );
        console.log(`captured ${relative(root, app.output)}`);
      } catch (error) {
        nextHashes[app.name] = hashes[app.name];
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`::warning file=apps/${app.name}::Screenshot failed: ${message}`);
      }
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClosed) => server.close(resolveClosed));
  }
}

for (const [name, hash] of Object.entries(nextHashes)) {
  if (!hash) delete nextHashes[name];
}
await writeFile(hashesPath, `${JSON.stringify(nextHashes, null, 2)}\n`);
