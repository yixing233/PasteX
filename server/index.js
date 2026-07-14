import compression from "compression";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const configuredPort = Number.parseInt(process.env.PORT ?? "7755", 10);
const PORT = Number.isInteger(configuredPort) ? configuredPort : 7755;

// 中间件
app.use(compression()); // Gzip/Brotli 压缩
app.use(cors());
app.use(express.json({ limit: "50mb" }));
// 静态文件服务 - 图片长期缓存
app.use(
  express.static("public", {
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      if (
        filePath.endsWith(".webp") ||
        filePath.endsWith(".png") ||
        filePath.endsWith(".jpg")
      ) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

// 数据存储根目录
const DATA_DIR = path.join(__dirname, "data");

// 确保数据根目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 内存中缓存所有用户的数据
// Map<tokenHash, Map<itemId, item>>
const dataStores = new Map();

// 实时同步：存储每个 Token 最新的剪贴板条目
// Map<tokenHash, item>
const latestStore = new Map();

// 密钥映射文件 (Hash -> Original Key)
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const knownTokens = new Map();

// 加载已知密钥
if (fs.existsSync(KEYS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"));
    Object.entries(data).forEach(([hash, key]) => knownTokens.set(hash, key));
  } catch (e) {
    console.error("加载 keys.json 失败:", e);
  }
}

const saveKnownTokens = () => {
  try {
    const data = Object.fromEntries(knownTokens);
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("保存 keys.json 失败:", e);
  }
};

// 加载指定 Hash 的存储 (如果内存中没有，尝试从磁盘加载)
const loadStore = (tokenHash) => {
  if (!dataStores.has(tokenHash)) {
    const userDir = path.join(DATA_DIR, tokenHash);
    const userFile = path.join(userDir, "favorites.json");

    let store = new Map();
    try {
      if (fs.existsSync(userFile)) {
        const data = fs.readFileSync(userFile, "utf-8");
        const items = JSON.parse(data);
        store = new Map(items.map((item) => [item.id, item]));
        console.log(
          `[${tokenHash.substring(0, 6)}...] 加载了 ${items.length} 条数据`,
        );
      }
    } catch (error) {
      console.error(`[${tokenHash}] 加载数据失败:`, error);
    }
    dataStores.set(tokenHash, store);
  }
  return dataStores.get(tokenHash) || new Map();
};

/**
 * 获取或初始化指定 Token 的数据存储
 * @param {string} token - 原始密钥
 * @returns {{tokenHash: string, store: Map}|null}
 */
const getStore = (token) => {
  if (!token) return null;
  // 计算 Token 的哈希值作为目录名，避免明文密钥泄露
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const store = loadStore(tokenHash);
  return { store, tokenHash };
};

/**
 * 保存指定 Token 的数据到文件
 * @param {string} tokenHash
 */
const saveStore = (tokenHash) => {
  const store = dataStores.get(tokenHash);
  if (!store) return;

  const userDir = path.join(DATA_DIR, tokenHash);
  const userFile = path.join(userDir, "favorites.json");

  try {
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    const items = Array.from(store.values());
    fs.writeFileSync(userFile, JSON.stringify(items, null, 2), "utf-8");
    // console.log(`[${tokenHash.substring(0, 6)}...] 保存了 ${items.length} 条数据`);
  } catch (error) {
    console.error(`[${tokenHash}] 保存数据失败:`, error);
  }
};

// 获取所有存储的基本信息
const getAllStoresInfo = () => {
  const stores = [];
  try {
    const storeKeys = new Set();

    if (fs.existsSync(DATA_DIR)) {
      const dirs = fs.readdirSync(DATA_DIR);

      for (const dir of dirs) {
        if (dir.startsWith(".") || dir.endsWith(".json")) continue; // Skip files like keys.json
        storeKeys.add(dir);
      }
    }

    // 仅创建纽带还未写入 favorites.json 时，也应显示在管理面板
    for (const tokenHash of knownTokens.keys()) {
      storeKeys.add(tokenHash);
    }

    // 兼容内存中已加载但尚未落盘的 store
    for (const tokenHash of dataStores.keys()) {
      storeKeys.add(tokenHash);
    }

    // 确保 include public even if empty directory check fails?
    // Typically public is created on first use.
    // We just scan whatever is there.
    for (const dir of storeKeys) {
      // Get original key if known
      const originalKey = knownTokens.get(dir);

      let label = `User (${dir.substring(0, 6)}...)`;
      if (dir === "public") {
        label = "公开/默认";
      } else if (originalKey) {
        if (originalKey.includes(":")) {
          try {
            const username = decodeURIComponent(originalKey.split(":")[0]);
            label = `用户: ${username}`;
          } catch (e) {
            label = `Key: ${originalKey}`;
          }
        } else {
          label = `Key: ${originalKey}`;
        }
      }

      const stats = {
        count: 0,
        key: originalKey || null, // Provide the real key if available
        label: label,
        lastUpdate: 0,
        storageUsed: 0,
        tokenHash: dir,
      };

      // Check in-memory first for latest count
      if (dataStores.has(dir)) {
        stats.count = dataStores.get(dir).size;
      }

      // Check file stats
      try {
        const userFile = path.join(DATA_DIR, dir, "favorites.json");
        if (fs.existsSync(userFile)) {
          const fileStats = fs.statSync(userFile);
          stats.lastUpdate = fileStats.mtimeMs;
          stats.storageUsed = fileStats.size;
          // If not in memory, read file to get accurate count.
          if (!dataStores.has(dir)) {
            const content = fs.readFileSync(userFile, "utf-8");
            const data = JSON.parse(content);
            stats.count = data.length;
          }
        }
      } catch (e) {
        // console.error('Reading store stats failed:', e);
      }

      stores.push(stats);
    }
  } catch (e) {
    console.error("Scanning data dir failed:", e);
  }
  return stores;
};

// 记录服务器启动时间
const serverStartTime = Date.now();

// 创建 HTTP 服务器
const server = createServer(app);

// 创建 WebSocket 服务器 - 使用 noServer 模式以支持 /ws 路径
const wss = new WebSocketServer({ noServer: true });

// 处理 HTTP Upgrade 请求，只在 /ws 路径上升级为 WebSocket
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`)
    .pathname;
  if (pathname === "/ws" || pathname === "/") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket 连接管理 - 存储客户端信息
// key: ws, value: { ws, info: {...}, connectedAt: timestamp, tokenHash: string }
const clients = new Map();

const normalizeIp = (ip) => {
  if (!ip || typeof ip !== "string") return "";

  const trimmed = ip.trim();
  if (!trimmed) return "";

  if (trimmed === "::1") return "127.0.0.1";
  if (trimmed.startsWith("::ffff:")) return trimmed.substring(7);

  return trimmed;
};

const getClientIp = (req) => {
  const xForwardedFor = req.headers["x-forwarded-for"];
  const xRealIp = req.headers["x-real-ip"];
  const cfConnectingIp = req.headers["cf-connecting-ip"];

  const headerCandidates = [cfConnectingIp, xRealIp, xForwardedFor];

  for (const candidate of headerCandidates) {
    if (!candidate) continue;

    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    if (!value || typeof value !== "string") continue;

    const firstIp = value.split(",")[0];
    const normalized = normalizeIp(firstIp);
    if (normalized) return normalized;
  }

  return normalizeIp(req.socket?.remoteAddress) || "unknown";
};

wss.on("connection", (ws, req) => {
  // 从 URL 参数中获取 Token (ws://host:port/?token=...)
  // 注意：客户端连接时需要传递此参数
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token") || "";

  // Support bypassing token with hash via query param?
  // Usually WebSocket connection for clients uses token.
  // Admin dashboard WebSocket? Maybe.
  // For now we assume standard clients use token.
  // Admin dashboard viewing might not need WebSocket or can use 'public' if just viewing.
  // If admin wants to subscribe to changes on a hash, we might need support.
  // Let's add 'token_hash' param support for WS too.
  const directHash = url.searchParams.get("token_hash");

  let tokenHash, store;

  if (directHash) {
    tokenHash = directHash;
    store = loadStore(tokenHash);
  } else {
    if (!token) {
      console.log("连接被拒绝: 未提供密钥");
      ws.close(1008, "Authentication Required: Please provide a valid token");
      return;
    }

    const result = getStore(token);
    // result will not be null here because we checked !token above
    tokenHash = result.tokenHash;
    store = result.store;

    if (!knownTokens.has(tokenHash)) {
      console.log(`连接被拒绝: 纽带不存在 [${tokenHash.substring(0, 6)}...]`);
      ws.close(1008, "Bond not found");
      return;
    }
  }

  console.log(`新客户端连接 [${tokenHash.substring(0, 6)}...]`);

  // 添加客户端
  const ip = getClientIp(req);
  clients.set(ws, {
    connectedAt: Date.now(),
    info: null,
    ip,
    tokenHash, // 绑定 Token Hash
    ws,
  });

  // 发送该 Token 下的所有收藏条目
  ws.send(
    JSON.stringify({
      data: Array.from(store.values()),
      type: "SYNC_ALL",
    }),
  );

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleMessage(data, ws, tokenHash, store);
    } catch (error) {
      console.error("消息解析错误:", error);
    }
  });

  ws.on("close", () => {
    console.log(`客户端断开连接 [${tokenHash.substring(0, 6)}...]`);
    clients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket 错误:", error);
  });
});

// 处理客户端消息
function handleMessage(data, senderWs, tokenHash, store) {
  const { type, payload } = data;

  switch (type) {
    case "CLIENT_INFO": {
      const client = clients.get(senderWs);
      if (client) {
        client.info = payload;
        // console.log('收到客户端信息:', payload);
      }
      break;
    }

    case "ADD":
      store.set(payload.id, payload);
      broadcast({ payload, type: "ADD" }, senderWs, tokenHash);
      saveStore(tokenHash);
      break;

    case "UPDATE":
      if (store.has(payload.id)) {
        store.set(payload.id, payload);
        broadcast({ payload, type: "UPDATE" }, senderWs, tokenHash);
        saveStore(tokenHash);
      }
      break;

    case "DELETE":
      store.delete(payload.id);
      broadcast(
        { payload: { id: payload.id }, type: "DELETE" },
        senderWs,
        tokenHash,
      );
      saveStore(tokenHash);
      break;

    case "PUSH_LATEST":
      // 实时同步：存储并广播最新剪贴板条目
      {
        const senderClient = clients.get(senderWs);
        const deviceId = senderClient?.info?.id;
        const deviceName = senderClient?.info?.hostname;
        let latestPayload = payload;

        if (payload && typeof payload === "object") {
          latestPayload = {
            ...payload,
            ...(deviceId ? { deviceId } : {}),
            ...(deviceName ? { deviceName } : {}),
          };
        }

        latestStore.set(tokenHash, latestPayload);
        broadcast(
          { payload: latestPayload, type: "LATEST_UPDATE" },
          senderWs,
          tokenHash,
        );
      }
      break;

    case "SYNC_REQUEST":
      senderWs.send(
        JSON.stringify({
          data: Array.from(store.values()),
          type: "SYNC_ALL",
        }),
      );
      break;

    default:
      console.log("未知消息类型:", type);
  }
}

// 广播消息 (仅发送给同一 Token Hash 的客户端)
function broadcast(message, senderWs, tokenHash) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    // 必须是不同的连接，且必须属于同一个 Token 空间
    if (
      client.ws !== senderWs &&
      client.ws.readyState === 1 &&
      client.tokenHash === tokenHash
    ) {
      client.ws.send(messageStr);
    }
  });
}

// === HTTP API 中间件 ===
// 从 Authorization Header 解析 Token 并注入 req
app.use((req, res, next) => {
  // 排除静态资源 (可选，静态资源不需要鉴权)
  if (req.path.startsWith("/api")) {
    // Exclude public endpoints
    if (
      req.path === "/api/bond/check" ||
      req.path === "/api/bond/verify" ||
      req.path === "/api/bond/register" ||
      req.path.startsWith("/api/admin/users") ||
      req.path.startsWith("/api/admin/changelog") ||
      req.path.startsWith("/api/changelog") ||
      req.path.startsWith("/api/auth") ||
      req.path === "/health"
    )
      return next();

    // Check for direct Hash access
    const headerHash = req.headers["x-token-hash"];
    if (headerHash) {
      req.tokenHash = headerHash;
      req.store = loadStore(headerHash);
      return next();
    } else {
      const authHeader = req.headers.authorization;
      let token = "";
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      if (!token) {
        return res.status(401).json({
          error: "Authentication Required: Token is missing",
          success: false,
        });
      }

      const result = getStore(token);
      // result will not be null here because we checked !token above
      if (
        !knownTokens.has(result.tokenHash) ||
        knownTokens.get(result.tokenHash) !== token
      ) {
        return res
          .status(404)
          .json({ error: "Bond not found", success: false });
      }

      req.tokenHash = result.tokenHash;
      req.store = result.store;
    }
  }
  next();
});

// === REST API 端点 ===

// 检查 Bond 用户名是否可用
app.get("/api/bond/check", (req, res) => {
  const { username } = req.query;
  if (!username)
    return res.status(400).json({ error: "Username required", success: false });

  // 检查是否有现有 Token 使用此用户名
  let exists = false;
  for (const token of knownTokens.values()) {
    const parts = token.split(":");
    if (parts.length > 1 && parts[0] === username) {
      exists = true;
      break;
    }
  }

  res.json({ available: !exists, success: true });
});

// 校验 Bond 是否存在（用于“装配已有纽带”）
app.post("/api/bond/verify", (req, res) => {
  const username = req.body?.username?.trim?.();
  const secretKey = req.body?.secretKey?.trim?.();

  if (!username) {
    return res.status(400).json({ error: "Username required", success: false });
  }
  if (!secretKey) {
    return res
      .status(400)
      .json({ error: "Secret key required", success: false });
  }

  const token = `${encodeURIComponent(username)}:${secretKey}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const knownToken = knownTokens.get(tokenHash);
  if (!knownToken || knownToken !== token) {
    return res.status(404).json({ error: "Bond not found", success: false });
  }

  res.json({ success: true, tokenHash });
});

// 注册 Bond（创建即注册到服务器）
app.post("/api/bond/register", (req, res) => {
  const username = req.body?.username?.trim?.();
  const secretKey = req.body?.secretKey?.trim?.();

  if (!username) {
    return res.status(400).json({ error: "Username required", success: false });
  }
  if (!secretKey) {
    return res
      .status(400)
      .json({ error: "Secret key required", success: false });
  }

  let existsWithDifferentCredential = false;
  for (const token of knownTokens.values()) {
    const parts = token.split(":");
    if (parts.length <= 1) continue;

    const existingUsername = decodeURIComponent(parts[0]);
    if (
      existingUsername === username &&
      token !== `${encodeURIComponent(username)}:${secretKey}`
    ) {
      existsWithDifferentCredential = true;
      break;
    }
  }

  if (existsWithDifferentCredential) {
    return res
      .status(409)
      .json({ error: "Username already exists", success: false });
  }

  const token = `${encodeURIComponent(username)}:${secretKey}`;
  const { tokenHash } = getStore(token);

  const knownToken = knownTokens.get(tokenHash);
  if (knownToken && knownToken !== token) {
    return res.status(409).json({ error: "Token conflict", success: false });
  }

  if (!knownToken) {
    knownTokens.set(tokenHash, token);
    saveKnownTokens();
    console.log(`注册新纽带: ${tokenHash.substring(0, 6)}... -> ${username}`);
  }

  res.json({ success: true, tokenHash });
});

// Generate RSA Key Pair for Admin Authentication
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() ?? "";
// Simple in-memory session store for admin tokens
const adminSessions = new Set();

// Get Public Key
app.get("/api/auth/public-key", (req, res) => {
  res.json({
    publicKey: publicKey.export({ format: "pem", type: "spki" }),
    success: true,
  });
});

// Admin Login
app.post("/api/auth/login", (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      error: "Admin login is disabled until ADMIN_PASSWORD is configured",
      success: false,
    });
  }

  const { encryptedPassword } = req.body;
  if (!encryptedPassword)
    return res.status(400).json({ error: "Password required", success: false });

  try {
    const decryptedPassword = crypto
      .privateDecrypt(
        {
          key: privateKey,
          oaepHash: "sha256",
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(encryptedPassword, "base64"),
      )
      .toString("utf8");

    if (decryptedPassword === ADMIN_PASSWORD) {
      const token = crypto.randomBytes(32).toString("hex");
      adminSessions.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: "Invalid password", success: false });
    }
  } catch (e) {
    console.error("Decryption failed:", e);
    res.status(400).json({ error: "Decryption failed", success: false });
  }
});

// Validate Admin Token
app.get("/api/auth/check", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (adminSessions.has(token)) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// Admin Logout
app.post("/api/auth/logout", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (token) {
    adminSessions.delete(token);
  }
  res.json({ success: true });
});

// Admin Middleware
const adminAuth = (req, res, next) => {
  const token = req.headers["x-admin-token"];
  if (adminSessions.has(token)) {
    next();
  } else {
    res
      .status(401)
      .json({ error: "Admin authentication required", success: false });
  }
};

// Admin endpoint for users list
app.get("/api/admin/users", adminAuth, (req, res) => {
  res.json({ data: getAllStoresInfo(), success: true });
});

// Delete a user/store (Admin)
app.delete("/api/admin/users/:tokenHash", adminAuth, (req, res) => {
  const { tokenHash } = req.params;

  // Prevent accidental deletion of protected paths?
  // tokenHash comes from URL, check for safety (no ..)
  if (
    tokenHash.includes("..") ||
    tokenHash.includes("/") ||
    tokenHash.includes("\\")
  ) {
    return res
      .status(400)
      .json({ error: "Invalid token hash", success: false });
  }

  const dir = path.join(DATA_DIR, tokenHash);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { force: true, recursive: true });
    } catch (e) {
      console.error(e);
      return res
        .status(500)
        .json({ error: "Failed to delete directory", success: false });
    }
  }

  // Clear memory
  if (dataStores.has(tokenHash)) {
    dataStores.delete(tokenHash);
  }

  if (knownTokens.has(tokenHash)) {
    knownTokens.delete(tokenHash);
    saveKnownTokens();
  }

  // Disconnect clients
  clients.forEach((client, ws) => {
    if (client.tokenHash === tokenHash) {
      ws.close(1008, "Store deleted by admin");
      // client removal happens in 'close' event handler usually
    }
  });

  res.json({ message: "User deleted", success: true });
});

// === Changelog Management ===
const CHANGELOG_FILE = path.join(DATA_DIR, "changelog.json");

// Default changelog data (seeded on first run)
const defaultChangelog = [
  {
    date: "2026-02-16",
    id: crypto.randomUUID(),
    items: ["优化纽带构建与连接机制"],
    links: [
      {
        text: "安装版下载",
        url: "https://github.com/yixing233/PasteX/releases/download/2.0.2/PasteX_2.0.2_x64-setup.exe",
      },
      {
        text: "便携版下载",
        url: "https://github.com/yixing233/PasteX/releases/download/2.0.2/PasteX_2.0.2_x64-portable.exe",
      },
    ],
    version: "v2.0.2",
  },
  {
    date: "2026-02-16",
    id: crypto.randomUUID(),
    items: [
      "同步设置优化：新增纽带机制",
      "需要填写用户名和密钥实现纽带创建与绑定",
      "实现数据隔离",
    ],
    links: [],
    version: "v2.0.1",
  },
  {
    date: "2026-02-15",
    id: crypto.randomUUID(),
    items: [
      "全平台同步升级：多用户隔离、端到端加密、断线自动重连",
      "UI/UX 全面焕新：现代化圆角设计、FontAwesome 图标、流畅动画",
      "国际化完善：新增繁体中文与日文支持",
      "体验优化：修复图片加载路径问题，优化长列表渲染性能",
    ],
    links: [],
    version: "v2.0.0",
  },
  {
    date: "2026-02-14",
    id: crypto.randomUUID(),
    items: [
      "增强了多端同步的稳定性",
      "优化了部分 UI 细节",
      "修复了一些已知问题",
    ],
    links: [],
    version: "v1.1.2",
  },
  {
    date: "2026-02-10",
    id: crypto.randomUUID(),
    items: [
      "分类导航升级：优化默认分类顺序，收藏夹固定顶部入口",
      "时间筛选交互升级：迁移至 TDesign 组件，增加流畅动画",
      "界面调整：优化主窗口尺寸与渲染性能",
    ],
    links: [],
    version: "v1.1.1",
  },
  {
    date: "2026-02-01",
    id: crypto.randomUUID(),
    items: [
      "日期筛选增强：支持按小时精确筛选，支持清除与快速编辑",
      "来源追踪：记录复制内容的来源应用",
      "交互优化：悬浮操作按钮，列表支持横向滚动",
      "统一设计语言：全局圆角规范与视觉细节打磨",
    ],
    links: [],
    version: "v1.1.0",
  },
];

// Load changelog data
const loadChangelog = () => {
  try {
    if (fs.existsSync(CHANGELOG_FILE)) {
      return JSON.parse(fs.readFileSync(CHANGELOG_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("加载 changelog.json 失败:", e);
  }
  // Seed default data
  saveChangelog(defaultChangelog);
  return defaultChangelog;
};

const saveChangelog = (data) => {
  try {
    fs.writeFileSync(CHANGELOG_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("保存 changelog.json 失败:", e);
  }
};

// Public: Get changelog
app.get("/api/changelog", (req, res) => {
  const data = loadChangelog();
  res.json({ data, success: true });
});

// Admin: Add changelog entry
app.post("/api/admin/changelog", adminAuth, (req, res) => {
  const { version, date, items, links } = req.body;
  if (!version || !date || !items || !Array.isArray(items)) {
    return res
      .status(400)
      .json({ error: "version, date, items[] required", success: false });
  }
  const data = loadChangelog();
  const entry = {
    date,
    id: crypto.randomUUID(),
    items,
    links: links || [],
    version,
  };
  data.unshift(entry); // Add to top
  saveChangelog(data);
  res.json({ data: entry, success: true });
});

// Admin: Update changelog entry
app.put("/api/admin/changelog/:id", adminAuth, (req, res) => {
  const { id } = req.params;
  const { version, date, items, links } = req.body;
  const data = loadChangelog();
  const idx = data.findIndex((e) => e.id === id);
  if (idx === -1)
    return res.status(404).json({ error: "Entry not found", success: false });

  if (version) data[idx].version = version;
  if (date) data[idx].date = date;
  if (items) data[idx].items = items;
  if (links !== undefined) data[idx].links = links;

  saveChangelog(data);
  res.json({ data: data[idx], success: true });
});

// Admin: Delete changelog entry
app.delete("/api/admin/changelog/:id", adminAuth, (req, res) => {
  const { id } = req.params;
  const data = loadChangelog();
  const idx = data.findIndex((e) => e.id === id);
  if (idx === -1)
    return res.status(404).json({ error: "Entry not found", success: false });

  data.splice(idx, 1);
  saveChangelog(data);
  res.json({ message: "Deleted", success: true });
});

// Admin: Reorder changelog entries
app.put("/api/admin/changelog-order", adminAuth, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "ids[] required", success: false });
  }
  const data = loadChangelog();
  const sorted = ids.map((id) => data.find((e) => e.id === id)).filter(Boolean);
  // Add any entries not in the ids list at the end
  data.forEach((e) => {
    if (!ids.includes(e.id)) sorted.push(e);
  });
  saveChangelog(sorted);
  res.json({ data: sorted, success: true });
});

app.use((req, res, next) => {
  // API 鉴权中间件 (Enforce Auth)
  // Exclude public endpoints AND Admin endpoints (handled by adminAuth)
  if (
    req.path === "/api/bond/check" ||
    req.path === "/api/bond/verify" ||
    req.path === "/api/bond/register" ||
    req.path.startsWith("/api/admin/users") ||
    req.path.startsWith("/api/admin/changelog") ||
    req.path.startsWith("/api/changelog") ||
    req.path.startsWith("/api/auth") ||
    req.path === "/health"
  )
    return next();

  const authHeader = req.headers.authorization;
  let token = "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res
      .status(401)
      .json({ error: "Authentication required", success: false });
  }

  const result = getStore(token);
  // getStore returns { store, tokenHash } or null
  if (!result) {
    return res.status(403).json({ error: "Invalid token", success: false });
  }

  if (
    !knownTokens.has(result.tokenHash) ||
    knownTokens.get(result.tokenHash) !== token
  ) {
    return res.status(404).json({ error: "Bond not found", success: false });
  }

  req.tokenHash = result.tokenHash;
  req.store = result.store;
  next();
});

// === REST API 端点 ===

// 获取当前鉴权上下文对应的纽带信息
app.get("/api/bond/me", (req, res) => {
  const tokenHash = req.tokenHash;
  const originalKey = knownTokens.get(tokenHash) || "";

  let username = null;
  if (originalKey && originalKey.includes(":")) {
    try {
      username = decodeURIComponent(originalKey.split(":")[0]);
    } catch (_e) {
      username = null;
    }
  }

  res.json({
    data: {
      hasBond: !!originalKey,
      keyKnown: !!originalKey,
      tokenHash,
      username,
    },
    success: true,
  });
});

// 获取所有在线客户端信息 (仅显示同一 Token 下的客户端)
app.get("/api/clients", (req, res) => {
  const tokenHash = req.tokenHash;
  const uniqueClients = new Map();

  clients.forEach((client) => {
    // 过滤：只看自己 Token 下的设备
    if (client.tokenHash !== tokenHash) return;

    const clientId = client.info && client.info.id;
    if (clientId) {
      if (
        !uniqueClients.has(clientId) ||
        client.connectedAt > uniqueClients.get(clientId).connectedAt
      ) {
        uniqueClients.set(clientId, client);
      }
    } else {
      // 未收到 CLIENT_INFO 时，用 IP 去重（防止同设备多 WS 连接被重复计入）
      const fallbackKey = `ip:${client.ip}`;
      if (!uniqueClients.has(fallbackKey)) {
        uniqueClients.set(fallbackKey, client);
      }
    }
  });

  const clientList = Array.from(uniqueClients.values()).map(
    (client, index) => ({
      connectedAt: client.connectedAt,
      duration: Date.now() - client.connectedAt,
      id: index + 1,
      info: client.info,
      ip: client.ip,
    }),
  );

  res.json({ data: clientList, success: true });
});

// 获取最新实时同步条目
app.get("/api/latest", (req, res) => {
  const item = latestStore.get(req.tokenHash);
  if (!item) {
    return res.json({ data: null, message: "暂无数据", success: true });
  }
  res.json({ data: item, success: true });
});

// 获取所有收藏条目
app.get("/api/favorites", (req, res) => {
  res.json({
    data: Array.from(req.store.values()),
    success: true,
  });
});

// 添加收藏条目
app.post("/api/favorites", (req, res) => {
  const item = req.body;
  if (!item.id)
    return res.status(400).json({ error: "缺少 id 字段", success: false });

  req.store.set(item.id, item);
  // 广播时找不到 senderWs (HTTP 请求)，传 null 表示发给所有人
  broadcast({ payload: item, type: "ADD" }, null, req.tokenHash);
  saveStore(req.tokenHash);

  res.json({ data: item, success: true });
});

// 更新收藏条目
app.put("/api/favorites/:id", (req, res) => {
  const { id } = req.params;
  const item = req.body;

  if (!req.store.has(id))
    return res.status(404).json({ error: "条目不存在", success: false });

  item.id = id;
  req.store.set(id, item);
  broadcast({ payload: item, type: "UPDATE" }, null, req.tokenHash);
  saveStore(req.tokenHash);

  res.json({ data: item, success: true });
});

// 删除收藏条目
app.delete("/api/favorites/:id", (req, res) => {
  const { id } = req.params;

  if (!req.store.has(id))
    return res.status(404).json({ error: "条目不存在", success: false });

  req.store.delete(id);
  broadcast({ payload: { id }, type: "DELETE" }, null, req.tokenHash);
  saveStore(req.tokenHash);

  res.json({ message: "删除成功", success: true });
});

// 获取服务器统计信息 (仅当前 Token)
app.get("/api/stats", (req, res) => {
  try {
    const stats = {
      serverStartTime: serverStartTime,
      storageUsed: 0,
      todayItems: 0,
      totalItems: req.store.size,
      uptime: Date.now() - serverStartTime,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    req.store.forEach((item) => {
      const createTime = new Date(item.createTime).getTime();
      if (createTime >= todayTime) stats.todayItems++;
    });

    // 计算存储占用
    const userFile = path.join(DATA_DIR, req.tokenHash, "favorites.json");
    if (fs.existsSync(userFile)) {
      stats.storageUsed = fs.statSync(userFile).size;
    }

    res.json({ data: stats, success: true });
  } catch (error) {
    console.error("获取统计信息失败:", error);
    res.status(500).json({ error: "获取统计信息失败", success: false });
  }
});

// 健康检查 (包含 Token 信息)
app.get("/health", (req, res) => {
  // 为了安全，health 接口可能不应该暴露太多信息
  // 但作为自用服务，显示连接数方便调试
  // 这里的 clients 数量可能需要过滤？或者显示总数？
  // 为了简化，显示总数，或者如果带了 token，显示该 token 下的数量

  // 复用中间件逻辑，如果有 token，则 req.store 已设置
  // 如果没有 token，req.tokenHash 默认为 'public' (因为我们对所有 /api 路径用了中间件，health 不在 /api 下？)

  // 检查是否应用了中间件
  // 上面 app.use 只针对匹配路径？不，是 app.use((req...) => ...)。
  // 但是我在代码里写了 if (req.path.startsWith('/api')) ...
  // 所以 /health 不会触发中间件的 token 解析逻辑。

  // 我们手动解析一下
  const authHeader = req.headers.authorization;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }
  const { tokenHash, store } = getStore(token);

  // 过滤该 token 下的客户端数（按设备 ID 去重，同一设备多个 WS 连接只计 1 次）
  const uniqueDevices = new Set();
  clients.forEach((c) => {
    if (c.tokenHash !== tokenHash) return;
    const deviceId = c.info && c.info.id;
    if (deviceId) {
      uniqueDevices.add(deviceId);
    }
    // 尚未收到 CLIENT_INFO 的连接忽略，避免同设备多 WS 重复计数
  });
  const clientCount = uniqueDevices.size;

  res.json({
    clients: clientCount, // 仅显示当前 Token 命名空间下的客户端数
    items: store.size, // 仅显示当前 Token 命名空间下的条目数
    startTime: serverStartTime,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// 启动服务器
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════╗
║   PasteX 同步服务器已启动              ║
║   端口: ${PORT}                        ║
║   WebSocket: ws://0.0.0.0:${PORT}/ws    ║
║   HTTP API: http://0.0.0.0:${PORT}       ║
║   模式: 多租户 (基于 Token 隔离)       ║
╚════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on("SIGTERM", () => {
  console.log("收到 SIGTERM 信号，正在关闭服务器...");
  server.close(() => {
    console.log("服务器已关闭");
    process.exit(0);
  });
});
