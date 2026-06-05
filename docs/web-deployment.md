# Web 自托管部署

ChatMux Web 端只能用于你自己部署、自己信任的 Gateway。不要把真实服务器地址、SSH 用户名、SSH 密码、私钥、Gateway Token 或终端输出输入到任何外部地址、第三方演示站或陌生域名。

## 部署架构

```text
Browser
  |
  | HTTPS recommended
  v
chatmux-web (Nginx static SPA)
  |
  | /api and WebSocket reverse proxy
  v
chatmux-gateway (Go)
  |
  | SSH
  v
Your servers with tmux installed
```

生产模板位于 `deploy/web/`：

- `docker-compose.yml`：启动 Web 与 Gateway。
- `.env.example`：部署环境变量模板。
- `../nginx/chatmux.conf`：Nginx SPA 与 API 反代配置。

Gateway 默认只在 compose 网络内暴露，宿主机只开放 Web 入口端口。

## 前置条件

- 一台你控制的 Linux 服务器。
- Docker Engine 与 Docker Compose plugin。
- 可以从部署机访问目标 SSH 主机。
- 目标 SSH 主机已经安装 `tmux`。
- 如果公网访问，必须准备你自己的 HTTPS 入口。

## 一键部署

```bash
git clone git@github.com:binjie09/ChatMux.git
cd ChatMux

cp deploy/web/.env.example deploy/web/.env
```

编辑 `deploy/web/.env`：

```dotenv
CHATMUX_HTTP_PORT=8080
CHATMUX_GATEWAY_TOKEN=replace-with-a-long-random-token
CHATMUX_DB=/data/chatmux.db
```

启动：

```bash
docker compose --env-file deploy/web/.env -f deploy/web/docker-compose.yml up -d --build
```

如果服务器只有旧版独立命令，可把 `docker compose` 替换为 `docker-compose`。

查看状态：

```bash
docker compose --env-file deploy/web/.env -f deploy/web/docker-compose.yml ps
docker compose --env-file deploy/web/.env -f deploy/web/docker-compose.yml logs -f
```

访问：

```text
http://你的服务器:8080
```

首次打开后输入 `CHATMUX_GATEWAY_TOKEN`。

## HTTPS 反向代理

如果服务暴露到公网，请在 `chatmux-web` 前面放你自己的 HTTPS 反向代理。反向代理需要支持 WebSocket upgrade，并把流量转发到 `127.0.0.1:${CHATMUX_HTTP_PORT}`。

Nginx 示例：

```nginx
server {
  listen 443 ssl http2;
  server_name chatmux.example.com;

  ssl_certificate /etc/letsencrypt/live/chatmux.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/chatmux.example.com/privkey.pem;
  client_max_body_size 64m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

也可以使用 Caddy：

```caddyfile
chatmux.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `CHATMUX_HTTP_PORT` | 否 | `8080` | Web 入口端口 |
| `CHATMUX_GATEWAY_TOKEN` | 是 | 无 | Gateway 管理 token，必须强随机 |
| `CHATMUX_DB` | 否 | `/data/chatmux.db` | SQLite 数据库路径 |
| `CHATMUX_USERS_JSON` | 否 | 空 | 静态用户列表 |
| `CHATMUX_COMMAND_POLICY_MODE` | 否 | `enforce` | 命令策略模式，支持 `enforce` 和 `audit` |
| `CHATMUX_COMMAND_DENY_PATTERNS_JSON` | 否 | 空 | composer 命令拒绝正则列表 |
| `CHATMUX_AUTOMATION_CAPABILITIES_JSON` | 否 | 空 | 自动化工具能力 allowlist |
| `OPENAI_API_KEY` | 否 | 空 | 启用 AI 总结和命令草稿 |
| `OPENAI_BASE_URL` | 否 | OpenAI 默认地址 | OpenAI-compatible API 地址 |
| `OPENAI_MODEL` | 否 | `gpt-5.5` | AI 模型 |

`CHATMUX_USERS_JSON` 示例：

```json
[
  {"name":"ops","role":"operator","token":"ops-token"},
  {"name":"viewer","role":"viewer","token":"viewer-token"}
]
```

角色：

- `viewer`：只读。
- `operator`：可以管理 host 和 tmux session。
- `admin`：完整权限。

## 更新

```bash
git pull
docker compose --env-file deploy/web/.env -f deploy/web/docker-compose.yml up -d --build
```

## 备份与恢复

SQLite 数据在 compose volume `chatmux-data` 中。备份前建议暂停写入：

```bash
docker compose --env-file deploy/web/.env -f deploy/web/docker-compose.yml stop gateway
docker run --rm -v chatmux_chatmux-data:/data -v "$PWD":/backup alpine \
  cp /data/chatmux.db /backup/chatmux.db.backup
docker compose --env-file deploy/web/.env -f deploy/web/docker-compose.yml start gateway
```

恢复时把备份文件放回 `/data/chatmux.db` 后重启 Gateway。

## 安全检查清单

- 只访问你自己的 ChatMux 域名。
- `CHATMUX_GATEWAY_TOKEN` 使用强随机值，并且不提交到 git。
- 不在 issue、日志、截图中粘贴 SSH 密码、私钥或 token。
- 公网部署必须使用 HTTPS。
- 限制服务器防火墙，只开放必要端口。
- 定期备份 SQLite 数据库。
- AI 功能只配置你信任的 OpenAI-compatible endpoint。
- 不把 Gateway 暴露给不可信的 Web 前端。
