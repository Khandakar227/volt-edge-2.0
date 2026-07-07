import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer, request as httpRequest } from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const distDir = path.resolve(
  process.env.FRONTEND_DIST ?? path.join(repoRoot, "frontend", "dist"),
)
const backendUrl = new URL(process.env.BACKEND_URL ?? "http://127.0.0.1:8787")
const publicHost = process.env.PUBLIC_HOST ?? "127.0.0.1"
const publicPort = Number(process.env.PUBLIC_PORT ?? "8080")

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
])

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

function filteredHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !hopByHopHeaders.has(key.toLowerCase())),
  )
}

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

function proxyApi(req, res) {
  const target = new URL(req.url ?? "/", backendUrl)
  const headers = filteredHeaders(req.headers)
  headers.host = backendUrl.host

  const proxyReq = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, filteredHeaders(proxyRes.headers))
      proxyRes.pipe(res)
    },
  )

  proxyReq.on("error", (error) => {
    if (!res.headersSent) {
      send(res, 502, `Backend proxy failed: ${error.message}`)
    } else {
      res.destroy(error)
    }
  })

  req.pipe(proxyReq)
}

function safeStaticPath(requestPathname) {
  const decoded = decodeURIComponent(requestPathname)
  const normalized = decoded === "/" ? "/index.html" : decoded
  const candidate = path.resolve(distDir, `.${normalized}`)
  const relative = path.relative(distDir, candidate)
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null
  return candidate
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  let filePath = safeStaticPath(url.pathname)
  if (!filePath) return send(res, 403, "Forbidden")

  let fileStat
  try {
    fileStat = await stat(filePath)
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, "index.html")
      fileStat = await stat(filePath)
    }
  } catch {
    filePath = path.join(distDir, "index.html")
    try {
      fileStat = await stat(filePath)
    } catch {
      return send(
        res,
        404,
        "Frontend build not found. Run `npm run build` in frontend/ first.",
      )
    }
  }

  const ext = path.extname(filePath)
  const cacheControl =
    filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
  res.writeHead(200, {
    "content-type": mimeTypes.get(ext) ?? "application/octet-stream",
    "content-length": fileStat.size,
    "cache-control": cacheControl,
  })
  createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  if ((req.url ?? "").startsWith("/api/")) {
    proxyApi(req, res)
    return
  }
  void serveStatic(req, res).catch((error) => {
    send(res, 500, `Static server failed: ${error.message}`)
  })
})

server.listen(publicPort, publicHost, () => {
  console.log(`VoltEdge public server: http://${publicHost}:${publicPort}`)
  console.log(`Serving frontend: ${distDir}`)
  console.log(`Proxying /api to: ${backendUrl.origin}`)
})
