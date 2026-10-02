# Changelog

本文件记录 @icen.ai/cli 的版本变更；更早版本（≤ 0.2.2）的变更见 git log 与 [Releases](https://github.com/icen-ai/cli/releases)。

## 0.3.0 - 2026-10-03

### 新功能
- `icen login` 回传协议升级为 `POST /key`（JSON body）：API key 不再出现在 URL 中，不会写入浏览器历史；旧版授权页的 `GET /?key=` 跳转仍兼容接收
- 本地回调服务器 CORS 收紧为 Origin 白名单（auth/accounts.icen.ai 与 localhost），并增加请求体大小上限——其他网页无法向本机伪造投递

### 文档
- AGENTS.md 加入 icen.ai 生态地图章节，登录流程描述与新协议同步
