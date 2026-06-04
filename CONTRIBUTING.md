# 贡献指南

感谢关注 ChatMux。这个项目处理 SSH、tmux、凭据和终端输出，贡献时请优先保证安全边界清晰、失败可见、行为可测试。

## 开发流程

```bash
pnpm install
cp .env.example .env

pnpm typecheck
pnpm build

cd services/gateway
CHATMUX_GATEWAY_TOKEN=dev-token go test ./...
```

提交 PR 前请确认：

- 没有提交 `.env`、数据库、私钥、token、构建产物或本地日志。
- README、`docs/`、部署模板和实际行为保持一致。
- 涉及 Gateway、安全、凭据、权限、WebSocket 或 tmux 行为时有对应测试。
- 用户可见行为变化已经更新文档。

## 代码风格

- 前端使用 React + TypeScript，遵循当前组件和 CSS 组织方式。
- Gateway 使用 Go 标准库优先，错误应明确返回，不做静默降级。
- 不新增任意 shell 执行能力；自动化工具必须是 allowlist。
- 不把 SSH 密码、私钥、Gateway Token 或原始终端输入写入日志。
- AI 功能必须由用户主动触发，不能自动上传终端内容。

## 提交 issue

请提供：

- ChatMux 版本或 commit。
- 部署方式：本地开发、Web 自托管、Tauri、Capacitor。
- 复现步骤。
- 期望结果和实际结果。
- 相关日志，但必须先脱敏。

不要在 issue、PR、截图或日志里粘贴真实服务器地址、SSH 密码、私钥、Gateway Token、OpenAI API Key 或敏感终端输出。
