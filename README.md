# @icen.ai/cli

`icen` — [icen.ai](https://icen.ai) skill 生态的统一命令行工具，从 [skill.icen.ai](https://skill.icen.ai) 安装和管理 AI agent skills。

The unified CLI for the icen.ai skill ecosystem — install and manage AI agent skills from [skill.icen.ai](https://skill.icen.ai).

## 安装 / Install

```bash
npx @icen.ai/cli --help     # Node ≥ 18
bunx @icen.ai/cli --help    # Bun
```

或直接运行命令，如 `npx @icen.ai/cli add network`。

## 命令 / Commands

| 命令 | 说明 |
|------|------|
| `icen add <id>` | 安装或更新 skill（幂等，hash 相同自动跳过）。id 支持短 id（`network`）或全名（`icen-network`） |
| `icen remove <id>` | 卸载 skill（含各平台目录同步删除） |
| `icen list` | 列出已安装 skill（读 lock 文件） |
| `icen update [id]` | 更新指定或全部已安装 skill |
| `icen search <query>` | 在 registry 的双语名称 / tags / keywords 中搜索 |
| `icen key <KEY>` | 设置 API 密钥（格式 `ICEN-XXXX-XXXX`，写入 `~/.icen/credentials.json`） |
| `icen whoami` | 显示当前凭证状态与账号信息 |

常用 flags：`-y/--yes`（跳过确认）、`--no-sync`（只装主目录）、`--json`（JSON 输出）、`--registry <url>`（临时换源）、`--key <KEY>`（临时指定密钥）。

## 鉴权 / Auth

免费 skill 无需凭证。付费 skill（index.json 中 `paid: true`）需要安装密钥，凭证优先级：

```
--key 参数  >  环境变量 ICEN_KEY  >  ~/.icen/credentials.json
```

```bash
icen key ICEN-A1B2-C3D4    # 在 https://skill.icen.ai/account 获取密钥
icen add <paid-skill>
```

付费包从 `<registry>/k/<key>/<name>.tar.gz` 下载，与官方 install.sh 走同一条鉴权路径。

## 环境变量 / Environment Variables

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ICEN_BASE_URL` | registry 地址 | `https://skill.icen.ai` |
| `ICEN_KEY` | 安装密钥 | — |
| `ICEN_HOME` | 凭证目录 | `~/.icen` |
| `ICEN_SKILLS_DIR` | 主 skills 目录 | `~/.agents/skills` |
| `NO_COLOR` | 禁用颜色输出 | — |

## 安装行为 / Install Behavior

与官方 `install.sh` 完全互操作：同一个 lock 文件（`~/.agents/skills/.icen-lock.json`）、同一套目录布局——主目录 `~/.agents/skills` 必装，`~/.claude`、`~/.cursor`、`~/.kimi-code` 等平台根目录存在时同步铺到其 `skills/` 子目录。混用 install.sh 和 CLI 不会互相踩。

Fully interoperable with the official `install.sh`: same lock file and same directory layout.

## License

MIT
