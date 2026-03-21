import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 4310);
const root = join(process.cwd(), "out");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function resolvePath(urlPath) {
  const safePath = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const fullPath = join(root, safePath === "/" ? "index.html" : safePath);

  if (existsSync(fullPath) && statSync(fullPath).isFile()) {
    return fullPath;
  }

  const withIndex = join(root, safePath, "index.html");
  if (existsSync(withIndex) && statSync(withIndex).isFile()) {
    return withIndex;
  }

  return null;
}

const server = createServer((request, response) => {
  const filePath = resolvePath(request.url || "/");

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`preview-ready http://${host}:${port}`);
});
