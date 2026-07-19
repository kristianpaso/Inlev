const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const appRoutes = new Set([
  "plock",
  "trav",
  "bigplus",
  "sandningar",
  "schema",
  "statistik",
  "users"
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function resolveFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]).replace(/\\/g, "/");
  const trimmed = cleanPath.replace(/^\/+/, "");
  const firstSegment = trimmed.split("/")[0];

  if (!trimmed) return path.join(PUBLIC_DIR, "index.html");
  if (appRoutes.has(firstSegment) && (trimmed === firstSegment || trimmed.startsWith(`${firstSegment}/`))) {
    const directPath = path.join(PUBLIC_DIR, trimmed);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) return directPath;
    return path.join(PUBLIC_DIR, firstSegment, "index.html");
  }

  return path.join(PUBLIC_DIR, trimmed);
}

const server = http.createServer((req, res) => {
  let filePath = resolveFile(req.url || "/");
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "404.html"), (notFoundError, notFoundBody) => {
        send(res, 404, notFoundError ? "Not found" : notFoundBody, {
          "Content-Type": "text/html; charset=utf-8"
        });
      });
      return;
    }

    send(res, 200, body, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Inlev frontend running at http://127.0.0.1:${PORT}/`);
  console.log(`Bigplus frontend running at http://127.0.0.1:${PORT}/bigplus/`);
});
