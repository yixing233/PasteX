# PasteX APK 实时同步实现文档（与 Windows 客户端对齐）

## 1. 文档目标

本方案用于指导 Android APK 实现“获取/推送最新复制内容”的远程实时同步能力，并与当前 Windows 客户端行为保持一致。

覆盖范围：

- Bond（纽带）建立、装配（绑定）、解绑
- 鉴权与 Token 规范
- WebSocket 数据传输（`PUSH_LATEST` / `LATEST_UPDATE`）
- 在线设备上报与查询（`CLIENT_INFO` / `/api/clients`）
- 最小可用实现（MVP）与验收清单

不覆盖范围：

- 管理员后台接口
- 局域网同步（LAN）
- 收藏夹全量同步细节（`ADD/UPDATE/DELETE/SYNC_ALL`）

---

## 2. 一致性基线（必须对齐）

APK 必须与 Windows 端保持以下一致性：

1. 同一套身份：`username + secretKey`
2. 同一 Token 构造：`encodeURIComponent(username):secretKey`
3. 同一 WS 参数编码：`token=encodeURIComponent(tokenString)`
4. 同一实时消息：上行 `PUSH_LATEST`，下行 `LATEST_UPDATE`
5. 同一在线设备机制：连接后发送 `CLIENT_INFO`，通过 `/api/clients` 查询

只要任一端不一致，会出现“连接成功但互相收不到实时消息”。

---

## 3. Bond（纽带）机制

### 3.1 建立纽带（Create Bond）

1. 用户输入 `username`
2. 客户端生成 `secretKey`（建议长度 32，字符集 `A-Za-z0-9`）
3. 调用用户名可用性接口：

- `GET /api/bond/check?username=<encodeURIComponent(username)>`

4. 若可用，调用注册接口：

- `POST /api/bond/register`
- Body: `{ "username": "...", "secretKey": "..." }`

5. 注册成功后，保存本地凭据：`username + secretKey`

成功示例：

```json
{
  "success": true,
  "available": true
}
```

注册成功示例：

```json
{
  "success": true,
  "message": "Bond registered successfully"
}
```

### 3.2 装配纽带（Equip Bond / 绑定）

装配即输入已有 `username + secretKey` 并保存到 APK 本地。

建议流程：

1. 本地保存凭据
2. `GET /health` 做服务可达性检查
3. 建立 WS 并等待 `onOpen`
4. `onOpen` 后立即发送 `CLIENT_INFO`

### 3.3 解绑纽带（Unbind Bond）

1. 清空本地 `username`、`secretKey`
2. 断开 WS
3. 关闭实时同步状态

注意：解绑仅影响本地客户端，不会删除服务端历史数据。

---

## 4. 鉴权与 Token 规范

### 4.1 Token String（HTTP/WS 的根凭据）

```text
tokenString = encodeURIComponent(username) + ":" + secretKey
```

示例：

- username: `alice@example.com`
- secretKey: `Abc+12/==`
- tokenString: `alice%40example.com:Abc+12/==`

### 4.2 WebSocket Query Token（必须二次编码）

```text
wsToken = encodeURIComponent(tokenString)
ws://host:7755/ws?token=<wsToken>
```

示例：

```text
ws://host:7755/ws?token=alice%2540example.com%3AAbc%2B12%2F%3D%3D
```

> 说明：如果不对整个 `tokenString` 再编码一次，`+`、`=` 等字符在 query 解码中可能失真，导致 `tokenHash` 不一致。

### 4.3 HTTP 鉴权头

```http
Authorization: Bearer <tokenString>
```

注意：HTTP 头里放的是 `tokenString` 本体，不是 query 编码后的字符串。

---

## 5. 实时数据传输协议

### 5.1 WebSocket 地址

- `ws://<host>:7755/ws`
- 推荐固定使用 `/ws`

### 5.2 连接后设备信息上报（在线设备显示依赖）

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
    "userAgent": "PasteX-Android/...",
    "timestamp": 1700000000000
  }
}
```

字段建议：

- `id`：设备稳定 ID（同设备重连不变）
- `hostname`：用户可识别的设备名
- `platform`：固定 `android`

### 5.3 上行：推送最新复制项 `PUSH_LATEST`

```json
{
  "type": "PUSH_LATEST",
  "payload": {
    "deviceId": "f3f4e2f8-1a6b-4a66-88c2-9e5b4bb2d3c1",
    "deviceName": "Pixel-8",
    "id": "nanoid-or-uuid",
    "type": "text",
    "value": "hello",
    "group": "text",
    "search": "hello",
    "favorite": false,
    "createTime": "2026-03-01 10:00:00"
  }
}
```

MVP 只需保证 `type="text"` 可用。

### 5.4 下行：接收其他设备推送 `LATEST_UPDATE`

```json
{
  "type": "LATEST_UPDATE",
  "payload": {
    "deviceId": "f3f4e2f8-1a6b-4a66-88c2-9e5b4bb2d3c1",
    "deviceName": "Pixel-8",
    "id": "...",
    "type": "text",
    "value": "hello",
    "group": "text",
    "search": "hello",
    "favorite": false,
    "createTime": "2026-03-01 10:00:00"
  }
}
```

处理规则（建议）：

1. 仅处理 `payload.type === "text"`
2. 若 `payload.deviceId === 本机deviceId`，则跳过（防止本机回写）
3. 可使用 `payload.deviceName` 作为“来源设备名”展示
4. 写入 Android 剪贴板
5. 开启 1~2 秒“回环抑制”窗口，避免写入后再被监听为新复制并重新上行

---

## 6. 在线设备传输（设备可见性）

### 6.1 查询在线设备

- `GET /api/clients`
- Header: `Authorization: Bearer <tokenString>`

响应示例：

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

### 6.2 显示规则说明

- 服务端仅返回“同 tokenHash”下的设备
- 发送 `CLIENT_INFO` 后，设备列表会显示真实设备信息
- 不发送 `CLIENT_INFO` 时，服务端会按 IP 归并为“未知设备”

---

## 7. 辅助拉取接口（冷启动补偿）

### 7.1 拉取最新实时条目

- `GET /api/latest`
- Header: `Authorization: Bearer <tokenString>`

返回语义：

- `200`：请求成功
  - 有最新条目：`{ success: true, data: <historyItem> }`
  - 暂无 latest：`{ success: true, data: null }`
- `401`：鉴权缺失或错误

建议 APK 在以下场景调用一次：

- 冷启动后 WS 尚未收到任何 `LATEST_UPDATE`
- 网络恢复后首次重连成功

---

## 8. APK 最小实现流程（MVP）

1. 用户输入 `serverUrl`、`username`、`secretKey`
2. 计算 `tokenString`
3. 连接 `ws://.../ws?token=${encodeURIComponent(tokenString)}`
4. `onOpen` 发送 `CLIENT_INFO`
5. 监听系统剪贴板变化：
   - 本地复制文本 -> 发送 `PUSH_LATEST`
6. 监听 `LATEST_UPDATE`：
   - 收到文本 -> 写入 Android 剪贴板（带回环抑制）
7. 可选：定时或手动调用 `/api/clients` 展示在线设备

---

## 9. 连接稳定性建议

1. 重连：`1s -> 2s -> 4s -> ... -> 10s`（上限 10s，带随机抖动，最大重连 5 次）
2. 网络切换（Wi-Fi/蜂窝）后立即重连
3. App 回前台时校验连接状态，不在线则重连
4. 上下行去重：
   - 上行 1~2 秒窗口内相同内容不重复 `PUSH_LATEST`
   - 下行相同 `value` 不重复写剪贴板

---

## 10. 错误与排障

### 10.1 WS 连上但互相收不到消息

重点检查：

1. 两端 `tokenString` 是否完全一致
2. WS query 是否对 `tokenString` 做了 `encodeURIComponent`
3. 是否都开启远程实时同步
4. 是否确实发出了 `PUSH_LATEST`

### 10.2 `/api/latest` 暂无数据

当前实现中，`/api/latest` 不再使用 `404` 表示“暂无数据”。

“暂无实时数据”场景会返回：

```json
{
  "success": true,
  "data": null
}
```

常见于：

- 该 token 下还未有人发送 `PUSH_LATEST`
- 服务端重启后内存 `latestStore` 已清空

### 10.3 `/api/clients` 没有设备名

原因：客户端未发送或发送了无效 `CLIENT_INFO`。

---

## 11. 验收清单

1. 同一 Bond 的 Windows 与 APK 同时在线
2. APK 复制文本，Windows 在 1 秒内收到并可粘贴
3. Windows 复制文本，APK 在 1 秒内收到并写入系统剪贴板
4. `/api/clients` 正确显示两端设备信息
5. `secretKey` 含 `+`、`=`、`/` 时仍可互通（验证编码链路）
6. 未产生 latest 时，`/api/latest` 返回 `200` 且 `data=null`

---

## 12. 参考：建议的数据结构（MVP）

```ts
interface LatestItem {
  id: string;
  type: "text" | "image" | "files" | "rtf" | "html";
  value: string | string[];
  group: string;
  search: string;
  favorite: boolean;
  createTime: string;
}
```

MVP 阶段建议先锁定：`type = "text"`。
