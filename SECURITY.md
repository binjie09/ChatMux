# 安全政策

ChatMux 处在 SSH 连接链路中，任何安全问题都可能影响服务器凭据、终端输出和远程操作权限。

## 支持范围

当前项目处于早期版本。安全修复会优先面向 `main` 分支。

## 报告漏洞

请不要公开披露未修复漏洞，也不要在公开 issue 中粘贴真实凭据或可利用细节。

报告内容建议包含：

- 受影响的 commit 或版本。
- 复现步骤。
- 影响范围。
- 你能提供的最小化日志或截图。

在公开渠道提交问题前，请移除：

- SSH 密码、私钥、passphrase。
- Gateway Token、OpenAI API Key。
- 真实服务器公网 IP、内网拓扑和用户名。
- 敏感终端输出。

## 部署安全基线

- Web 端必须 self-host，只连接你自己信任的 Gateway。
- 不要把服务器地址、SSH 凭据或 Gateway Token 输入到外部演示站、第三方托管地址或陌生域名。
- 公网部署必须使用 HTTPS。
- `CHATMUX_GATEWAY_TOKEN` 必须是强随机值。
- `.env`、SQLite 数据库和备份文件不得提交到 git。
- AI 功能默认关闭；仅配置你信任的 OpenAI-compatible endpoint。
