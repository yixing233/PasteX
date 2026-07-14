# PasteX 同步服务器

## 功能说明

这是 PasteX 剪贴板管理工具的同步服务器，用于实现多设备间收藏剪贴板条目的实时同步。

## 特性

- ✅ WebSocket 实时同步
- ✅ REST API 支持
- ✅ 自动广播更新
- ✅ 内存存储（可扩展为数据库）
- ✅ 支持增删改操作

## 安装

```bash
cd server
npm install
```

## 启动

启动管理后台前必须通过环境变量配置管理员密码。服务端不再提供默认密码。

```bash
# 生产环境
ADMIN_PASSWORD="请替换为强密码" npm start

# 开发环境（自动重启）
ADMIN_PASSWORD="请替换为强密码" npm run dev
```

PowerShell：

```powershell
$env:ADMIN_PASSWORD = "请替换为强密码"
npm start
```

## API 文档

### WebSocket 连接

```
ws://localhost:7755
```

#### 消息格式

**客户端发送：**

```json
{
  "type": "ADD|UPDATE|DELETE|SYNC_REQUEST",
  "payload": {
    "id": "条目ID",
    "value": "剪贴板内容",
    "type": "text|image|files|rtf|url",
    "createTime": "创建时间",
    "note": "备注"
  }
}
```

**服务器响应：**

```json
{
  "type": "ADD|UPDATE|DELETE|SYNC_ALL",
  "data": [] // 或单个对象
}
```

### REST API

#### 1. 获取所有收藏条目

```
GET /api/favorites
```

**响应：**
```json
{
  "success": true,
  "data": [...]
}
```

#### 2. 添加收藏条目

```
POST /api/favorites
Content-Type: application/json

{
  "id": "unique-id",
  "value": "content",
  "type": "text",
  ...
}
```

#### 3. 更新收藏条目

```
PUT /api/favorites/:id
Content-Type: application/json

{
  "value": "new content",
  ...
}
```

#### 4. 删除收藏条目

```
DELETE /api/favorites/:id
```

#### 5. 健康检查

```
GET /health
```

## 配置

- **端口**: 通过 `PORT` 环境变量配置，默认 `7755`
- **管理员密码**: 通过必填的 `ADMIN_PASSWORD` 环境变量配置；未配置时管理后台登录会被禁用
- **CORS**: 默认允许所有来源（生产环境建议限制）
- **消息大小限制**: 50MB

## 客户端集成示例

```javascript
// 连接 WebSocket
const ws = new WebSocket('ws://localhost:7755');

ws.onopen = () => {
  console.log('已连接到同步服务器');
  
  // 请求同步所有数据
  ws.send(JSON.stringify({
    type: 'SYNC_REQUEST'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'SYNC_ALL':
      // 同步所有收藏条目
      console.log('收到所有数据:', message.data);
      break;
    case 'ADD':
      // 添加新条目
      console.log('新增条目:', message.payload);
      break;
    case 'UPDATE':
      // 更新条目
      console.log('更新条目:', message.payload);
      break;
    case 'DELETE':
      // 删除条目
      console.log('删除条目:', message.payload.id);
      break;
  }
};

// 发送新增条目
function addFavorite(item) {
  ws.send(JSON.stringify({
    type: 'ADD',
    payload: item
  }));
}

// 发送更新条目
function updateFavorite(item) {
  ws.send(JSON.stringify({
    type: 'UPDATE',
    payload: item
  }));
}

// 发送删除条目
function deleteFavorite(id) {
  ws.send(JSON.stringify({
    type: 'DELETE',
    payload: { id }
  }));
}
```

## 注意事项

1. 当前使用内存存储，服务器重启后数据会丢失
2. 如需持久化，可集成 SQLite、MongoDB 等数据库
3. 生产环境建议添加身份验证和加密
4. 建议配置反向代理（如 Nginx）处理 SSL/TLS

## 扩展建议

- [ ] 添加用户认证
- [ ] 数据持久化（数据库）
- [ ] 支持文件上传（图片、文件类型）
- [ ] 添加日志系统
- [ ] 实现数据加密
- [ ] 添加速率限制
