# PasteX Server Deployment Guide

## 1. 基础配置

服务器默认监听端口为 `7755`。
由于 Node.js 默认可能只监听 `localhost` (127.0.0.1)，我们已经修改代码使其监听 `0.0.0.0` (所有网络接口)。

部署前必须设置 `ADMIN_PASSWORD` 环境变量，且不要将真实密码写入源码、文档或提交记录。可通过 `PORT` 环境变量覆盖默认端口。

## 2.防火墙设置 (Firewall)

如果要通过公网访问，必须在服务器防火墙放行 `7755` 端口。

### Linux (UFW)

```bash
sudo ufw allow 7755/tcp
sudo ufw reload
```

### Windows

1. 打开 "Windows Defender 防火墙"
2. 进入 "高级设置" -> "入站规则" -> "新建规则"
3. 选择 "端口" -> "TCP", 输入 "7755"
4. 选择 "允许连接", 命名规则并保存

### 云服务器 (AWS/阿里云/腾讯云)

需要在云服务商的控制台 "安全组" (Security Group) 中添加入站规则：

- 协议: TCP
- 端口范围: 7755
- 源 IP: 0.0.0.0/0 (允许所有 IP 访问)

## 3. 端口转发 (如果是家庭宽带)

如果你是在本地电脑运行并希望公网访问：

1. 需要在路由器后台设置 **端口映射 (Port Forwarding)**。
2. 将外部端口 `7755` 映射到你电脑的局域网 IP (例如 `192.168.1.x`) 的 `7755` 端口。
3. 确保你有公网 IP，否则需要使用内网穿透工具 (如 FRP, Ngrok, Cloudflare Tunnel)。

## 4. 推荐生产环境部署 (使用 Nginx 反向代理 + SSL)

直接暴露 Node.js 端口不推荐用于生产环境。建议使用 Nginx 反向代理，并配置 HTTPS。

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:7755;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

使用 Certbot 获取免费 SSL 证书：

```bash
sudo certbot --nginx -d your-domain.com
```

## 5. 后台运行 (PM2)

建议使用 PM2 让服务在后台运行并在崩溃后自动重启。

```bash
npm install -g pm2
ADMIN_PASSWORD="请替换为强密码" pm2 start index.js --name "pastex-server"
pm2 save
pm2 startup
```
