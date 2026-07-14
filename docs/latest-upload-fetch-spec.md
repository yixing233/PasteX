# PasteX latest 上传与获取（当前实现）

> 更新时间：2026-03-07  
> 适用范围：当前仓库 `latest` 相关实现（Remote Realtime Sync）

## 1. 术语与范围

- **latest**：同一 `tokenHash` 命名空间下“最近一次实时复制”的条目快照。
- **上传**：客户端通过 WebSocket 发送 `PUSH_LATEST`。
- **获取**：
  - 在线实时获取：WebSocket 下行 `LATEST_UPDATE`
  - 冷启动补偿获取：HTTP `GET /api/latest`

本文件仅描述 **latest 上传与获取**，不覆盖收藏夹全量同步（`ADD/UPDATE/DELETE/SYNC_ALL`）细节。

---

## 2. 鉴权与连接

### 2.1 WebSocket（用于上传与实时获取）

- 地址：`ws://<host>:7755/ws`
- Query：`token=<encodeURIComponent(tokenString)>`
- `tokenString` 规则：

```text
tokenString = encodeURIComponent(username) + ":" + secretKey
```

客户端连接成功后会先发送 `CLIENT_INFO`（含 `id`、`hostname`），服务端会用它补全 latest 的设备字段。

### 2.2 HTTP（用于冷启动获取）

- 接口：`GET /api/latest`
- Header：`Authorization: Bearer <tokenString>`

---

## 3. 上传：`PUSH_LATEST`

## 3.1 触发时机（客户端）

当本机产生新的历史项（`HISTORY_UPDATED`）且满足以下条件时触发上传：

1. 开启实时同步 `realtimeSync.enabled = true`
2. 模式为 `remote`
3. 不在回环抑制窗口内（`suppressLatestPushRef = false`）

## 3.2 上传消息结构

```json
{
  "type": "PUSH_LATEST",
  "payload": {
    "id": "nanoid-or-uuid",
    "type": "text",
    "value": "hello world",
    "group": "text",
    "search": "hello world",
    "favorite": false,
    "createTime": "2026-03-07 10:00:00",

    "deviceId": "stable-client-id",
    "deviceName": "GIGA"
  }
}
```

## 3.3 图片上传补充

当 `payload.type === "image"` 且 `value` 是可读路径时，客户端会尝试补 `imageData`（Base64 Data URL）：

```json
{
  "type": "PUSH_LATEST",
  "payload": {
    "id": "...",
    "type": "image",
    "value": "C:/.../xxx.png",
    "group": "image",
    "search": "",
    "favorite": false,
    "createTime": "2026-03-07 10:00:00",

    "deviceId": "stable-client-id",
    "deviceName": "GIGA",
    "imageData": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

## 3.4 服务端处理（收到 `PUSH_LATEST`）

服务端行为：

1. 从当前连接对应的 `CLIENT_INFO` 读取：
   - `info.id` -> `deviceId`
   - `info.hostname` -> `deviceName`
2. 覆盖/补齐 payload 中的 `deviceId`、`deviceName`
3. 写入 `latestStore.set(tokenHash, latestPayload)`
4. 向同 tokenHash 的其他在线连接广播 `LATEST_UPDATE`

> 说明：即使上行 payload 未带设备字段，服务端也会尽量按连接信息补齐。

---

## 4. 获取（在线）：`LATEST_UPDATE`

## 4.1 下行消息结构

```json
{
  "type": "LATEST_UPDATE",
  "payload": {
    "id": "nanoid-or-uuid",
    "type": "text",
    "value": "hello world",
    "group": "text",
    "search": "hello world",
    "favorite": false,
    "createTime": "2026-03-07 10:00:00",

    "deviceId": "stable-client-id",
    "deviceName": "GIGA"
  }
}
```

图片类型可能额外包含：

- `imageData`：`data:image/...;base64,...`

## 4.2 客户端接收处理规则

收到 `LATEST_UPDATE` 后：

1. 若 `payload.deviceId === 本机clientId`，跳过（防止本机回写）
2. 自动拉取场景（WS 实时下行 / connect 首拉 / poll 轮询）增加时效限制：

- 若 latest 时间戳早于当前时间 5 秒以上，则跳过自动应用
- 手动拉取不受此限制

3. `type=text`：写入系统剪贴板文本
4. `type=image` 且有 `imageData`：先落地本地图片再写入剪贴板
5. 开启约 2 秒回环抑制，避免“写入剪贴板 -> 再次上行”
6. 若带 `deviceName`，会记录为该条目的来源名，用于界面显示（如显示在“x分钟前”右侧）

---

## 5. 获取（离线/冷启动）：`GET /api/latest`

## 5.1 请求

```http
GET /api/latest
Authorization: Bearer <tokenString>
```

## 5.2 响应

- 有数据：

```json
{
  "success": true,
  "data": {
    "id": "...",
    "type": "text",
    "value": "hello world",
    "deviceId": "stable-client-id",
    "deviceName": "GIGA",
    "createTime": "2026-03-07 10:00:00"
  }
}
```

- 无数据：

```json
{
  "success": true,
  "message": "暂无数据",
  "data": null
}
```

---

## 6. 字段说明（latest 相关）

- `deviceId`：设备稳定 ID（用于回环判断）
- `deviceName`：设备可读名称（用于 UI 显示来源设备）
- `type`：当前实现重点支持 `text`、`image`
- `imageData`：仅图片场景可选
- 其他字段（`id/group/search/favorite/createTime/...`）沿用历史项结构

---

## 7. 对接建议（第三方客户端）

1. 上行 `PUSH_LATEST` 时建议主动带上 `deviceId` + `deviceName`
2. 连接后立即发 `CLIENT_INFO`，确保服务端可补全设备字段
3. 下行 `LATEST_UPDATE` 必做“本机回环过滤 + 窗口去重”
4. 冷启动先拉一次 `/api/latest`，再进入 WS 实时流
5. UI 展示建议优先读取 `payload.deviceName` 作为来源设备名
