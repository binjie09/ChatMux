# 使用方式

ChatMux 用于连接你自己部署的 Gateway，再由 Gateway 连接你的 SSH 主机。Web 端必须 self-host。不要在外部地址、第三方演示站或陌生域名输入真实服务器地址、SSH 密码、私钥或 Gateway Token。

## 登录 Gateway

1. 打开你的 ChatMux Web 地址。
2. 输入自托管部署中配置的 `CHATMUX_GATEWAY_TOKEN`。
3. Token 会保存在当前客户端：
   - Web：浏览器本地存储，适合自托管和本地开发。
   - iOS / Android：系统安全存储，可配合生物识别解锁。
   - Tauri 桌面端：系统凭据存储。

如果 token 失效或需要切换 Gateway，点击 `Replace token` 或清除 token 后重新输入。

## 添加 SSH 主机

点击 `Add host`，填写：

- `Name`：ChatMux 内展示名称。
- `Hostname`：服务器地址，可以是内网 IP、域名或跳板后可访问地址。
- `Port`：SSH 端口，默认通常为 `22`。
- `Username`：SSH 用户名。
- Auth method：
  - `Password`：保存 SSH 密码。
  - `Private key`：保存私钥，可选 passphrase。

保存后，API 响应只返回 `hasCredential` 等标记，不会把原始密码或私钥回传给前端列表接口。

## 信任主机指纹

首次连接主机前点击 `Trust host`。这一步会记录 SSH host key 指纹，避免无提示连接到被替换的主机。

如果服务器重装或 SSH host key 合法变化，请先确认变化来源，再重新信任。

## 保存 SSH 凭据并打开会话

1. 选择一个 host。
2. 点击 `Save SSH credential`。
3. ChatMux 会向 Gateway 申请短期 `credentialToken`。
4. 使用该 token 列出或创建 tmux session。

短期 token 默认在内存中使用，到期后前端会尝试用已保存 host credential 刷新。

## tmux 会话

ChatMux 把远程 tmux session 当作可恢复的工作会话：

- 点击已有 session 可打开终端。
- 在 `New session` 输入名称可创建新 session。
- Session 会展示运行状态，例如 `running`、`waiting`、`idle`、`failed`。
- 可以编辑标题、标签、共享状态和协作者。

目标 SSH 主机必须安装 `tmux`。如果远程 `tmux` 不在 PATH 中，可在远程环境里配置 `CHATMUX_TMUX_BIN`。

## 终端操作

主工作区是真实 xterm.js 终端，通过 WebSocket 连接 Gateway PTY：

- 支持 shell、vim、top、htop、lazygit、codex 等交互式程序。
- 支持复制、粘贴、选择、resize、Ctrl-C、Ctrl-D、Esc、Tab 和方向键。
- 移动端窄屏会显示常用快捷键。

底部 composer 可以发送命令或文本。Composer 发送的内容会经过命令策略检查；直接在终端中键入的原始输入不进入命令审计，避免记录密码或交互式 TUI 输入。

## 历史、搜索和审计

右侧面板提供：

- tmux pane 历史捕获。
- 历史搜索。
- AI 总结入口。
- 审计事件列表。

审计事件用于追踪连接、凭据 token 创建、历史捕获、终端恢复等关键动作，不保存 SSH 密码、私钥或原始终端输入。

## AI 总结和命令草稿

AI 功能默认关闭。只有 Gateway 设置 `OPENAI_API_KEY` 后才会启用：

- `Summarize` 会在用户点击时捕获当前 tmux pane 历史并发送给配置的 OpenAI-compatible API。
- `Draft` 会根据当前历史和用户提示生成命令草稿、解释和风险级别。
- 草稿不会自动执行，必须由用户点击插入并显式发送。

如果终端输出包含敏感信息，不要启用或触发 AI 功能，除非你信任配置的 AI API endpoint。

## 共享与权限

Gateway 支持静态用户和角色：

- `viewer`：只读。
- `operator`：可以管理 host 和 tmux session。
- `admin`：完整权限。

Host 可以设为 private 或 shared。tmux session 也可以设置 owner、shared 和 collaborators。协作者可以使用会话，但不能编辑元数据和授权。

## 常见问题

### Web 打不开 Gateway

- 确认 Web 地址是你自己的自托管地址。
- 检查 `CHATMUX_GATEWAY_TOKEN` 是否正确。
- 检查反向代理是否支持 WebSocket。
- 查看 `docker compose logs -f`。

### 无法连接 SSH

- 确认 Gateway 机器可以访问目标主机和端口。
- 确认用户名、密码或私钥正确。
- 确认目标主机 SSH 服务正常。
- 首次连接前先信任 host key。

### 看不到 tmux 会话

- 确认远程主机已安装 `tmux`。
- 确认当前 SSH 用户有权限运行 tmux。
- 如果 tmux 不在 PATH 中，在远程环境配置 `CHATMUX_TMUX_BIN`。

### WebSocket 连接中断

- 检查反向代理的 WebSocket upgrade 设置。
- 增大代理读超时。
- 点击 `Reconnect` 重新连接终端。
