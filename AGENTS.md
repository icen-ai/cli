# AGENTS.md — @icen.ai/cli

本文件面向 AI 编程助手，介绍本仓库的结构、构建流程与开发约定。

## icen.ai 生态

本仓库是 icen.ai 生态的一部分。核心项目：

| 项目 | 职责 | 域名 |
|------|------|------|
| accounts | 账户/鉴权/支付/权益 | auth/accounts/pay.icen.ai |
| skill | AI skill 站 + registry | skill.icen.ai |
| cli | npm @icen.ai/cli | — |
| ui | 共享 UI 组件库 | — |

**域名分工**（auth/accounts/pay 路由到同一个 accounts Pages 项目）：
- auth.icen.ai — 登录/SSO/JWT/CLI 授权
- accounts.icen.ai — 账户管理/API key/订单
- pay.icen.ai — 支付/定价

**跨项目联动**（改一侧需同步另一侧）：
- CLI ↔ skill：lock 格式、hash 算法、PLATFORM_ROOTS（installer.ts ↔ install.sh 逐字一致）
- CLI ↔ accounts：login 流程走 auth.icen.ai/cli，whoami 走 auth.icen.ai/api/oauth/validate
- skill ↔ accounts：SSO + 付费 skill 下载鉴权（/k/）+ 购买跳转 pay.icen.ai

> 完整生态文档（部署流程、D1、密钥等）见上级目录 `../AGENTS.md`（如有完整工作区）。

## 项目概览

icen.ai skill 生态的统一 CLI，npm 包名 `@icen.ai/cli`，bin 名 `icen`。从静态 registry（默认 <https://skill.icen.ai>）安装/更新/卸载 AI agent skills，与官方 `install.sh` / `install.ps1` 完全互操作。

registry 端源码在 `icen/skill` 仓库（`web/public/index.json` 由 `scripts/build-index.mjs` 生成）。plan 文档里的 `/api/skill/:id/meta` 端点**不存在**，CLI 只依赖 `/index.json` 与 `/skills/*.tar.gz`、`/k/<key>/*.tar.gz`。

## 技术栈

- TypeScript ESM，Node ≥ 18 兼容（npx 走 Node），开发用 Bun。
- 运行时依赖只有三个：`citty`（命令解析）、`kleur`（颜色）、`tar`（解压 tar.gz）。不要无理由新增依赖。交互提示用原生 readline。
- HTTP 用原生 fetch；hash 用 node:crypto sha256。
- tsup 打包单文件 ESM 到 `dist/cli.mjs`（shebang 由 tsup banner 注入）。

## 构建与开发命令

```bash
bun install
bun run build     # tsup → dist/cli.mjs
bun run dev -- add network -y   # 直接用 Bun 跑 TS 源码（参数透传）
node dist/cli.mjs --help        # 冒烟
```

没有测试框架与 lint。验证方式：`bun run build` + 用环境变量隔离目录做真实冒烟：

```bash
# Windows 下 Node 不认识 Git Bash 的 /tmp（会被解析到 C:\tmp），冒烟路径用 C:/ 形式
export ICEN_HOME=C:/tmp/icen-test ICEN_SKILLS_DIR=C:/tmp/icen-test-skills
node dist/cli.mjs skill add network -y          # 默认只装用户级
node dist/cli.mjs skill add network -y -s       # 追加项目级 ./.agents/skills
node dist/cli.mjs skill list --json
```

## 代码组织

```
src/cli.ts              # 入口，注册 skill / login / logout / whoami / key
src/commands/
  skill.ts              # `icen skill` 命名空间入口（注册 add/remove/list/update/search 子命令）
  add.ts                # 安装（交互式目录选择 + -s 项目级 + --all 全平台）
  remove.ts list.ts update.ts search.ts    # skill 子命令
  login.ts logout.ts    # 浏览器授权登录/登出
  whoami.ts key.ts      # 凭证状态 / 手动设置密钥
src/lib/
  config.ts             # 环境变量解析（ICEN_BASE_URL / ICEN_KEY / ICEN_HOME / ICEN_SKILLS_DIR）
  log.ts                # 输出封装（--json / --quiet / NO_COLOR）+ fail()
  auth.ts               # credentials.json 读写（0600）、key 格式校验、凭证优先级
  registry.ts           # fetch index.json（60s 内存缓存）、短 id 解析、tarball 下载、付费 /k/ 路径
  installer.ts          # 解压 → 内容 hash 校验 → 铺到指定 dirs（调用方算好目录，不再内部探测）
  platforms.ts          # PLATFORM_ROOTS 列表 + detectTargetDirs（update/remove 兼容用）
  prompt.ts             # 交互式安装目标选择（buildTargets / selectTargets）
  lock.ts               # .icen-lock.json CRUD
```

## 与 install.sh 的互操作约定（改动高危区）

CLI 与 skill 仓库的 `web/public/install.sh` / `install.ps1` 共享以下协议，**任何一侧改动必须同步另一侧**：

1. **lock 文件**：`<skillsDir>/.icen-lock.json`，扁平对象 `{ "icen-network": "6058a24f85cc" }`（完整 name → 内容 hash），2 空格缩进 JSON，读取时容错（损坏按空处理）。**不是** plan-cli.md 里 `{version, skills: {...}}` 的结构——plan 是早期设计，以 install.sh 实际格式为准。
2. **平台目录**：`PLATFORM_ROOTS`（platforms.ts）与 install.sh 的探测列表逐字一致（`.claude .kimi-code .cursor .codex .trae .trae-cn .traecli .qoder .qoderwork .codebuddy .workbuddy`）。CLI 与 install.sh 的区别：install.sh 全铺到所有检测到的平台目录；CLI `icen skill add` 默认只装用户级 `~/.agents/skills`，TTY 下弹出交互式编号多选让用户追加其他目录，`--all` 等价 install.sh 的全铺行为。
3. **付费路径**：`<base>/k/<key>/<name>.tar.gz`，免费用 index.json 的 `tarball` 字段。
4. **hash 语义**：index.json 的 `hash` 是**注入官方申明之前**的目录内容 hash（文件相对路径排序 → 逐文件 sha256 hex 拼接 → 再 sha256 → 前 12 位 hex），**不是 tar.gz 字节的 sha256**。CLI 校验方式：解压后把官方申明从 SKILL.md 末尾剥离再复算目录 hash。`installer.ts` 里的 `officialDecl()` 与 `dirHash()` 复刻自 skill 仓库 `scripts/build-index.mjs`，两处必须逐字节一致（含申明里行尾两个空格的 Markdown 硬换行）；build-index.mjs 改算法或申明文案时同步改这里。申明缺失（registry 格式变化）时降级为跳过校验并警告，不阻断安装。

## 鉴权约定

- 凭证优先级：`--key` flag > `ICEN_KEY` > `~/.icen/credentials.json`（`{ "apiKey": "ICEN-XXXX-XXXX" }`，mode 0600）。
- key 格式：`ICEN-[A-Z0-9]{4}-[A-Z0-9]{4}`。
- `whoami` 在线验证走 `GET https://auth.icen.ai/api/oauth/validate`（`Authorization: ApiKey <key>`），失败降级提示不阻断。
- `icen login`：启动本地回调服务器 → 打开浏览器到 `auth.icen.ai/cli?port=<port>` → 用户授权后页面生成/重置 API key 并 redirect 回 CLI → 自动保存到 credentials.json。
- `icen logout`：仅清除本地 credentials.json，不影响 accounts 侧 session。

## 其他约定

- 输出纪律：`--json` 时 stdout 只输出 JSON（进度/警告一律静默或走 stderr）；错误信息走 stderr 且 exit code 非 0。
- Windows 兼容：文件路径一律 `node:path`；dirHash 的相对路径统一转正斜杠再排序（与 Linux CI 构建索引的口径一致）。
- CI：`.github/workflows/ci.yml`，push main → setup-bun → bun install → build → `node dist/cli.mjs --help` 冒烟。

## 发布（npm，OIDC Trusted Publishing）

> 完整操作手册（含新项目接入步骤、首发流程、排障索引）见 `docs/publish-npm.md`——新包（如 `@icen.ai/ui`）照它执行。

**只允许 CI 发布，不允许任何 token**。npm 包设置已开 Trusted Publisher（GitHub Actions：`icen-ai/cli` + `publish.yml`，仅 `npm publish` 权限）且 Publishing access =「Require 2FA and disallow tokens」——本地 `npm publish` 会被拒，这是刻意的。

发布流程：

```bash
# 1. 改版本号（package.json 的 version；CLI 运行时版本号从 package.json 读取，不要手写别处）
# 2. commit + push main
# 3. 打 tag 推送即自动发布（或发 GitHub Release，等价）
git tag v0.1.3 && git push origin v0.1.3
```

`.github/workflows/publish.yml`：setup-bun 构建 → `npm publish --access public`（npm CLI 自动检测 OIDC，provenance 溯源签名自动生成）。

注意事项：

- `package.json` 的 `repository.url` 必须指向 `github.com/icen-ai/cli`——provenance 会校验仓库归属，不匹配 422 拒发。改仓库地址时同步这里。
- npm 账号 2FA 是 passkey-only（无 TOTP、bypass token 已被 npm 新政策禁用）。万不得已要本地手动发布：需要 npm ≥ 11.16 + Node ≥ 22.14，EOTP 报错后按提示在浏览器完成安全密钥验证拿一次性口令 `--otp=`；正常情况永远不要这样做，走 CI。
- 首发（包还不存在时）无法走 OIDC（npm 没有 pending publisher），0.1.0 就是手动首发的；之后所有版本都走 tag。

## login / logout（浏览器授权流程）

`icen login` 启动本地回调服务器 → 打开浏览器到 `auth.icen.ai/cli?port=<port>` → 用户授权后页面生成/重置 API key 并 redirect 到 `http://localhost:<port>/?key=<apikey>` → CLI 接收回调、保存到 credentials.json。

- 授权页 `auth.icen.ai/cli`（accounts 仓库 `src/pages/cli.astro`，三域名共路由），检测 session → 已登录则显示授权按钮 → 点击后 `POST /api/keys`（新建）或 `POST /api/keys/rotate`（已有 key 则重置）→ redirect 回调。
- **已有 key 的用户授权会重置旧 key**（key 明文不落库，无法取回，只能 rotate）。这是刻意的设计。
- CLI 端 5 分钟超时自动退出。

## 命令结构与安装目标选择

`icen` 是 icen.ai 生态级 CLI，顶层保留 `login`/`logout`/`whoami`/`key` 给未来其他产品。所有 skill 管理操作收到 `icen skill` 命名空间下：

```
icen skill add <id|url>    # 安装（支持短 id、全名、tar.gz URL）
icen skill remove <id>     # 卸载
icen skill list            # 已安装列表
icen skill update [id]     # 更新
icen skill search <query>  # 搜索 registry
```

`skill add` 的安装目标选择（三个模式）：

- **默认（TTY）**：弹出编号多选，默认勾选用户级 `~/.agents/skills`，可选追加其他检测到的平台目录及项目级
- **`-y`**：跳过交互，默认只装用户级 `~/.agents/skills`（CI / 脚本用）
- **`--all`**：装到用户级 + 所有检测到的平台目录（等价 install.sh 的全铺行为）
- **`-s` / `--save`**：额外安装到项目级 `./.agents/skills`（可与上述任意模式组合）

hash 相同时仍检查目标目录是否都存在（`-s` 场景项目级可能缺失），缺失则补铺。

## URL 安装

`icen skill add <url>` 支持直接从 tar.gz URL 安装（第三方源，vercel 兼容），不走 registry 索引、不做 hash 校验。自动探测 tar.gz 内的顶层目录名作为 skill name。同样支持 `-y` / `-s` / `--all` 目录选择。

## 留待后续版本

- `network@<hash>` 版本锁定、`config` 命令、依赖解析
