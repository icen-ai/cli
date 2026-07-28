# publish-npm.md — icen-ai 仓库 npm 全自动发布指南（OIDC Trusted Publishing）

> 目标：任何 `@icen.ai/*` 包做到「推 tag → CI 自动发布到 npm」，**全程不存任何 npm token**，
> 每次发布自带 provenance 溯源签名。本文是经过验证的完整步骤（2026-07 在 `@icen.ai/cli` 上跑通），
> 新项目（如 `@icen.ai/ui`）照此执行即可。
>
> 背景：npm 正在淘汰 TOTP 和 bypass-2FA token（2026/8 账号侧、2027/1 直接发布侧），
> icen 的 npm 账号（thatcompany）是 **passkey-only 2FA**（只有安全密钥，没有验证器 App）。
> 所以正确姿势只有两条：**交互发布走浏览器安全密钥**，**自动发布走 GitHub OIDC**。

---

## 0. 前置条件（一次性，已完成，无需重做）

- npm org `@icen.ai` 已存在，thatcompany 是 owner
- npm 账号 2FA 已开（安全密钥），「Require 2FA for write actions」已开
- 本指南发布后，**不需要** GitHub repo secrets（OIDC 免 token，与 Cloudflare 部署的 `CLOUDFLARE_*` secrets 无关）

## 1. 仓库与 package.json 要求

- 仓库必须 **Public**（npm provenance 校验需要公开仓库；Settings → Danger Zone → Change visibility，GitHub 会要求 sudo 验证）
- `package.json` 必填项：

```jsonc
{
  "name": "@icen.ai/<pkg>",
  "version": "0.1.0",
  "type": "module",
  "bin": { "<cmd>": "./dist/cli.mjs" },          // CLI 包才有
  "files": ["dist"],
  "repository": {                                 // ⚠️ 必须！provenance 校验仓库归属，
    "type": "git",                                //     不匹配会 422 拒发
    "url": "git+https://github.com/icen-ai/<repo>.git"
  },
  "publishConfig": { "access": "public" },        // scoped 包默认 private，必须显式 public
  "license": "MIT"
}
```

- CLI 运行时显示的版本号**从 package.json 读取**（`import pkg from '../package.json' with { type: 'json' }`），不要在源码里手写版本号

## 2. CI workflow（两个）

`.github/workflows/ci.yml`：push main → setup-bun → install → build → 冒烟。只验证不发布。

`.github/workflows/publish.yml`（照抄，改构建命令即可）：

```yaml
name: publish

on:
  push:
    tags: ['v*']          # 推 tag 即发版（推荐）
  release:
    types: [published]    # 或发 GitHub Release，等价

permissions:
  id-token: write         # OIDC，必需
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '24'   # npm CLI >= 11.5.1（trusted publishing 要求）
          registry-url: 'https://registry.npmjs.org'
      - run: bun install && bun run build
      - run: npm publish --access public
        # 不要设 NODE_AUTH_TOKEN！有值（哪怕是空串）会遮蔽 OIDC
```

## 3. 首发（鸡生蛋问题，每个包只做一次）

npm 没有 pending publisher——**Trusted Publisher 配置挂在包的设置页上，包必须已存在**。
所以第一个版本必须手动发布：

1. 本机 npm 需 **≥ 11.16**（配套 Node ≥ 22.14；Node 24.18 自带 npm 11.16）。
   版本不够时下官方 zip 临时用即可，不用污染环境。
2. 登录：`npm login --registry https://registry.npmjs.org`（浏览器里用安全密钥完成）。
   - 注意本机环境可能有 `NPM_CONFIG_REGISTRY` 指向镜像源，所有命令显式带 `--registry=https://registry.npmjs.org`。
3. 发布：`npm publish --access public --registry=https://registry.npmjs.org`
   - 报 `EOTP` 是正常的——npm 11.16 会提示「Open this URL in your browser to authenticate」，
     但 URL 在日志里被脱敏。用 curl 复现拿真实 URL：
     ```bash
     TOKEN=$(grep authToken ~/.npmrc | cut -d= -f2)
     curl -si -X PUT "https://registry.npmjs.org/@icen.ai%2f<pkg>" \
       -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
       -d '{"name":"@icen.ai/<pkg>"}' | grep npm-notice
     # npm-notice: Open https://www.npmjs.com/login/<uuid> to use your security key ...
     ```
   - 浏览器打开该 URL → 安全密钥确认 → 页面显示一串一次性口令
   - `npm publish --access public --registry=https://registry.npmjs.org --otp=<口令>`
4. 验证：`npm view @icen.ai/<pkg> versions --registry=https://registry.npmjs.org`

## 4. 配置 Trusted Publisher（首发后立刻做）

npmjs.com → 包页面 → Settings tab（每次进要安全密钥验证）→ **Trusted Publisher**：

- Publisher: **GitHub Actions**
- Organization or user: `icen-ai`
- Repository: `<repo>`
- Workflow filename: `publish.yml`（只写文件名，不带路径）
- Environment name: 留空
- Allowed actions: 勾 **Allow npm publish**

同页 **Publishing access** 选「**Require two-factor authentication and disallow tokens (recommended)**」
→ Update Package Settings。此后 token 一律拒发，只有这条 CI 能发。

## 5. 日常发布（全自动）

```bash
# 1. 改 package.json version（如 0.1.1）
# 2. commit + push main
# 3. 打 tag 推送
git tag v0.1.1 && git push origin v0.1.1
# publish.yml 自动构建发布，npm 包页面会出现 provenance 徽章
```

发布失败时先看 Actions 日志，常见原因见下。

## 6. 踩过的坑（排障索引）

| 症状 | 原因 | 解法 |
|---|---|---|
| `422 ... repository.url is ""` | package.json 缺 `repository` 字段 | 补上，重打 tag |
| `ENEEDAUTH ... npmmirror.com` | 环境变量 `NPM_CONFIG_REGISTRY` 指向镜像 | 命令显式带 `--registry=https://registry.npmjs.org` |
| `EOTP`（本地手动发布） | npm 已禁 bypass token，账号无 TOTP | 走第 3 节的安全密钥 web 验证流程（需 npm ≥11.16） |
| OIDC 发布 401/404 | Trusted Publisher 的 org/repo/workflow 名不匹配（大小写敏感） | 核对 npm 包设置页 |
| token 登录但 publish 401 | `NODE_AUTH_TOKEN` 空串遮蔽 OIDC | env 里彻底去掉该变量 |
| 版本号显示陈旧 | 版本号硬编码在源码 | 改从 package.json 读取 |

## 7. 检查清单（新项目照做）

- [ ] 仓库 Public + 初始代码推 main
- [ ] package.json：name/version/repository/publishConfig/files
- [ ] `.github/workflows/ci.yml` + `publish.yml`
- [ ] 手动首发 v0.1.0（第 3 节）
- [ ] npm 包设置：Trusted Publisher + disallow tokens（第 4 节）
- [ ] `git tag v0.1.1` 验证全自动链路 + provenance 徽章
- [ ] 临时 token（如果首发建过）立即吊销
- [ ] AGENTS.md 补一节「发布」指向本文档
