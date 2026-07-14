# PasteX 远程实时同步开发文档（面向 APK）

## 1. 目标与范围

本文档基于当前代码实现，描述 PasteX 的 **实时同步 → 远程同步** 机制，供 Android APK（或其他客户端）对接。

覆盖内容：

- Bond（纽带）创建/装配/解绑方法
- 鉴权与 Token 构造
- WebSocket 协议与消息类型
- 实时同步触发链路（何时会发 `PUSH_LATEST`）
- REST 辅助接口（`/api/latest`、`/api/clients`）
- 错误语义与排障
- APK 实现建议（连接、重连、去重、回环抑制）

不覆盖内容：

- 管理员后台（`/api/auth/*`、`/api/admin/*`）
- 局域网同步（LAN）

---

## 2. 术语

- **Bond**：`username + secretKey` 组合出来的身份凭据。
- **Token String**：`encodeURIComponent(username):secretKey`。
- **tokenHash**：服务端对 Token String 做 `SHA256` 后的哈希，用于多租户隔离。
- **latestStore**：服务端内存 Map，键是 `tokenHash`，值是最新剪贴板条目。

---

## 3. 架构总览

### 3.1 数据平面

1. 客户端 A 发生复制事件。
2. 客户端 A 发送 WS 消息：`{ type: "PUSH_LATEST", payload: <historyItem> }`。
3. 服务端：
   - `latestStore.set(tokenHash, payload)`
   - 向同 `tokenHash` 其他连接广播 `LATEST_UPDATE`
4. 客户端 B 收到 `LATEST_UPDATE`，写入本机剪贴板（当前实现仅 text）。

### 3.2 控制平面

- 设备在线列表：`GET /api/clients`
- 最新实时条目拉取：`GET /api/latest`

---

## 4. 配置与开关依赖（非常关键）

远程实时同步能否工作，依赖下列条件同时满足：

1. `sync.serverUrl` 非空
2. `sync.username` 非空
3. `sync.secretKey` 非空
4. 并且满足其一：
   - `sync.enabled === true`（收藏同步开启）
   - 或 `realtimeSync.enabled === true && realtimeSync.mode === "remote"`

当前默认值：

- `realtimeSync.enabled = false`
- `realtimeSync.mode = "remote"`
- `sync.enabled = false`

结论：仅有服务器地址和密钥不够，至少要开启远程实时同步或收藏同步。

---

## 5. 鉴权与 Token 规范

## 5.1 统一 Token String

Token String 定义：

`tokenString = encodeURIComponent(username) + ":" + secretKey`

示例：

- username: `alice@example.com`
- secretKey: `Abc+12/==`
- tokenString: `alice%40example.com:Abc+12/==`

## 5.2 WebSocket 连接参数（注意二次编码）

WS URL 参数必须传：

`token = encodeURIComponent(tokenString)`

即：

- 先对 username 编码，拼出 tokenString
- 再对整个 tokenString 编码进 URL query

示例：

`ws://host:7755/ws?token=alice%2540example.com%3AAbc%2B12%2F%3D%3D`

> 若少这一步，`+` 等字符在 query 解析时会变形，导致 `tokenHash` 不一致，出现“连接成功但互相收不到实时消息”。

## 5.3 HTTP 鉴权

HTTP 使用 Header：

`Authorization: Bearer <tokenString>`

注意：这里是 tokenString 本体，不是 URL 编码后的 query 字符串。

## 5.4 Bond 创建（Create Bond）

当前实现中，Bond 创建包含“本地生成 + 服务端注册”：

1. 用户输入 `username`
2. 客户端生成 `secretKey`（长度 32，字符集 `A-Za-z0-9`）
3. 客户端调用 `GET /api/bond/check?username=...` 检查用户名可用性
4. 可用后调用 `POST /api/bond/register` 提交 `username/secretKey`
5. 注册成功后把 `username/secretKey` 保存到本地配置 `sync.username/sync.secretKey`

结论：服务端会登记 Bond（用于后续管理台可见性与可追踪性），客户端仍以 `tokenString` 作为通信鉴权凭据。

## 5.5 Bond 装配（Equip Bond）

装配即“输入已有的 `username + secretKey` 并保存到本地配置”。

当前实现：

- 装配阶段不访问服务端
- 后续通过 WS/HTTP 实际连接来验证是否可用

推荐 APK 实现：

- 装配后立即做一次健康检查（`GET /health`）
- 再建立 WS，观察是否连接成功

## 5.6 Bond 解绑（Unbind Bond）

当前客户端解绑行为：

- `sync.enabled = false`
- `sync.username = ""`
- `sync.secretKey = ""`

注意：解绑只影响本地，不会删除服务端数据。若要删除服务端用户数据，需管理员接口（不在本文档范围）。

## 5.7 用户名可用性检查接口

- Method: `GET`
- Path: `/api/bond/check`
- Query: `username`

成功返回：

```json
{
  "success": true,
  "available": true
}
```

不可用示例：

```json
{
  "success": true,
  "available": false
}
```

错误示例（缺少 username）：

```json
{
  "success": false,
  "error": "Username required"
}
```

## 5.7.1 Bond 注册接口

- Method: `POST`
- Path: `/api/bond/register`
- Body:

```json
{
  "username": "alice",
  "secretKey": "Abc123..."
}
```

成功示例：

```json
{
  "success": true,
  "message": "Bond registered successfully"
}
```

## 5.8 Secret Key 规则（当前客户端校验）

客户端在创建 Bond / 启用收藏同步 / 测试连接时，会校验：

1. 非空
2. 长度 `>= 8`
3. 仅允许 ASCII 可打印字符（十六进制范围 `0x20-0x7E`）

说明：

- 当前 UI 生成器默认生成 32 位字母数字串，天然满足规则。
- 若 APK 允许用户自定义密钥，建议完全复用该规则，避免桌面端与移动端行为不一致。

## 5.9 APK 端 Bond 接口建议

建议封装以下方法：

- `createBond(serverUrl, username): BondCredential`
  - 生成 `secretKey`
  - 调用 `/api/bond/check`
  - 返回 `{ username, secretKey }`

- `equipBond(username, secretKey): void`
  - 本地保存凭据
  - 异步触发连接验证

- `unbindBond(): void`
  - 清空本地凭据
  - 主动断开 WS

- `buildTokenString(username, secretKey): string`
  - 返回 `encodeURIComponent(username):secretKey`

- `buildWsUrl(serverUrl, tokenString): string`
  - 返回 `/ws?token=${encodeURIComponent(tokenString)}`

这样可保证 APK 与桌面端在 Bond 行为上完全一致。

---

## 6. WebSocket 协议

服务端入口：`/ws`（也兼容 `/` 升级，但客户端建议固定 `/ws`）。

### 6.1 客户端上行消息

- `CLIENT_INFO`
- `ADD`
- `UPDATE`
- `DELETE`
- `SYNC_REQUEST`
- `PUSH_LATEST`

### 6.2 服务端下行消息

- `SYNC_ALL`
- `ADD`
- `UPDATE`
- `DELETE`
- `LATEST_UPDATE`

### 6.3 CLIENT_INFO（推荐）

连接成功后应尽快发送：

```json
{
  "type": "CLIENT_INFO",
  "payload": {
    "id": "stable-client-id",
    "hostname": "Pixel-8",
    "platform": "android",
    "osType": "Android",
    "osVersion": "14",
  "appVersion": "3.0.0",
    "arch": "arm64",
    "language": "zh-CN",
    "userAgent": "...",
    "timestamp": 1700000000000
  }
}
```

作用：

- `GET /api/clients` 设备列表可正确显示设备名和平台。
- 若不发送，服务端会把该连接归类为“未知设备”（按 IP 去重）。

### 6.4 PUSH_LATEST / LATEST_UPDATE

上行：

```json
{
  "type": "PUSH_LATEST",
  "payload": {
    "deviceId": "f3f4e2f8-1a6b-4a66-88c2-9e5b4bb2d3c1",
    "id": "...",
    "type": "text",
    "value": "hello",
    "group": "text",
    "search": "hello",
    "favorite": false,
    "createTime": "2026-02-28 11:11:11"
  }
}
```

下行（广播给同 tokenHash 其他设备）：

```json
{
  "type": "LATEST_UPDATE",
  "payload": {
    "deviceId": "f3f4e2f8-1a6b-4a66-88c2-9e5b4bb2d3c1",
    "id": "...",
    "type": "text",
    "value": "hello",
    "group": "text",
    "search": "hello",
    "favorite": false,
    "createTime": "2026-02-28 11:11:11"
  }
}
```

说明：

- `deviceId` 用于标识 latest 的来源设备，客户端可据此过滤“本机自身推送”的数据。

---

## 7. REST 接口（远程实时同步相关）

## 7.1 获取在线客户端

- Method: `GET`
- Path: `/api/clients`
- Header: `Authorization: Bearer <tokenString>`
- Response:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "connectedAt": 1700000000000,
      "duration": 12345,
      "ip": "127.0.0.1",
      "info": {
        "id": "stable-client-id",
        "hostname": "Pixel-8",
        "platform": "android"
      }
    }
  ]
}
```

## 7.2 获取最新实时条目

- Method: `GET`
- Path: `/api/latest`
- Header: `Authorization: Bearer <tokenString>`

返回语义：

- `200`: 请求成功
  - 有数据：`{ success: true, data: <historyItem> }`
  - 暂无 latest：`{ success: true, data: null }`
- `401`: 缺失或错误鉴权

---

## 8. 实时推送触发链路（当前实现）

## 8.1 系统剪贴板变化

监听器收到系统复制变化后，会入库并触发 `HISTORY_UPDATED`，随后满足远程模式条件时发送 `PUSH_LATEST`。

## 8.2 应用内复制/写剪贴板

当前已修复：应用内复制路径会主动触发 `HISTORY_UPDATED`，因此也会走 `PUSH_LATEST`。

这意味着：

- “系统复制” 与 “应用内复制” 都能触发远程实时同步。

## 8.3 回环抑制

收到 `LATEST_UPDATE` 后，本机写入剪贴板时会开启短时间抑制标记，避免“写入后又当作新复制再推送”的回环。

---

## 9. 服务端存储与一致性特征

1. 收藏夹数据（`ADD/UPDATE/DELETE`）持久化到 `data/<tokenHash>/favorites.json`
2. `latestStore` 仅内存存储，不持久化
3. 服务端重启后：
   - 收藏夹可恢复

- latest 实时条目丢失，`/api/latest` 会返回 `200 + data: null`，直到下一次 `PUSH_LATEST`

---

## 10. APK 端实现建议

## 10.1 最小可用流程

1. 用户输入：`serverUrl`、`username`、`secretKey`
2. 生成 `tokenString`
3. 建立 WS：`/ws?token=${encodeURIComponent(tokenString)}`
4. WS `onOpen` 发送 `CLIENT_INFO`
5. 监听 `LATEST_UPDATE`：
   - 若 `payload.type === "text"`，写入 Android 剪贴板
6. 本机复制事件发生时，发送 `PUSH_LATEST`

## 10.2 重连策略

建议：

- 初始 1s，指数退避到 10s（含随机抖动，最大重连 5 次）
- 网络切换（Wi-Fi/移动网络）后立即触发一次重连
- App 回前台时校验连接状态并重连

## 10.3 去重与节流

建议在 APK 端做：

- 最近一次上行内容 Hash（例如 1~2 秒窗口）去重
- 最近一次下行内容去重，防止系统重复通知导致重复写入

## 10.4 数据模型建议（对齐服务端）

至少保证字段：

- `id: string`
- `type: "text" | "image" | "files" | "rtf" | "html"`
- `value: string | string[]`
- `group: string`
- `search: string`
- `favorite: boolean`
- `createTime: string`

实时同步优先支持 `type="text"`，可先做 MVP。

---

## 11. 常见故障与排障清单

## 11.1 WS 已连接但收不到其他设备实时更新

重点检查：

1. 两端 token 是否完全一致（尤其 `+`、`=`）
2. WS query 是否对 tokenString 做了 `encodeURIComponent`
3. 两端是否都在 `realtimeSync.enabled=true && mode=remote`（或 `sync.enabled=true`）
4. 是否真的发送了 `PUSH_LATEST`

## 11.2 `/api/latest` 一直为空

若响应为 `200` 且 `data=null`，表示“暂无 latest 数据”，不是接口不存在。常见原因：

- 尚未发生任何 `PUSH_LATEST`
- 服务端刚重启，`latestStore` 已清空

## 11.3 `/api/clients` 显示未知设备

客户端未发送 `CLIENT_INFO`。

---

## 12. 安全与合规提醒

当前实现特征：

- 传输安全依赖部署层（建议全站 HTTPS/WSS）
- 服务端用 `SHA256(tokenString)` 做数据隔离标识
- 默认并非端到端加密（服务器可见明文 payload）

若 APK 上线公网，建议至少补充：

- HTTPS/WSS 强制
- 密钥轮换机制
- 设备级吊销机制
- 速率限制与审计日志

---

## 13. 对接验收用例（建议）

1. 两设备同 Token 连接成功，`/api/clients` 显示双方设备名
2. 设备 A 复制文本，设备 B 在 1 秒内收到 `LATEST_UPDATE`
3. 设备 B 复制文本，设备 A 同步收到
4. 服务端重启后，`/api/latest` 返回 `200 + data=null`；再次复制后恢复有数据的 `200`
5. secretKey 含 `+`、`=`、`/` 时仍能正常互通（验证编码）

---

## 14. 版本说明

- 文档生成时间：2026-02-28
- 基于当前仓库实现（客户端 Tauri + Node.js 服务端）
- 若后续协议字段变更，请同步更新本文档
