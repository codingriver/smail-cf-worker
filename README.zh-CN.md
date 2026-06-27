# smail Cloudflare Worker 中文文档

> **快速跳转**
>
> - [返回 README](./README.md)
> - [一键部署](#一键部署)
> - [Cloudflare 配置](#cloudflare-配置)
> - [API 调用](#api-调用)
> - [管理员 Token](#管理员-token)
> - [验证码提取](#验证码提取)

基于 React Router Framework Mode + Cloudflare Workers 的临时邮箱服务。项目支持网页收信、邮件详情预览、附件下载、HTML 邮件内联图片显示，并提供适合自动化脚本调用的 API。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/codingriver/smail-cf-worker)

## 项目信息

- 线上域名：`https://smail.606055.xyz`
- Worker 名称：`smail`
- 邮箱后缀：`606055.xyz`
- 默认语言：`en`
- 支持语言：`en/zh/es/fr/de/ja/ko/ru/pt/ar`
- 上游来源：[akazwz/smail](https://github.com/akazwz/smail)

## 核心功能

- 一键生成 24 小时临时邮箱地址
- 实时查看收件箱邮件列表
- 查看邮件 HTML/Text 正文
- 识别和下载邮件附件
- 显示 HTML 邮件中的 `cid:` 内联图片
- 提供 API 获取地址、邮件列表、邮件详情和验证码
- 管理员可通过 Cloudflare Secret 配置的 Token 查询指定邮箱
- SEO 路由：`/robots.txt`、`/sitemap.xml`、`/rss.xml`

## 一键部署

点击 README 顶部的 Deploy to Cloudflare 按钮即可部署到自己的 Cloudflare 账号。

部署前需要确认：

- 仓库为公开仓库，否则 Cloudflare 一键部署可能无法拉取。
- `wrangler.jsonc` 中的 D1、R2、路由域名适合你的账号。
- 生产环境必须配置 Secret，见下方 [Cloudflare 配置](#cloudflare-配置)。

## 本地开发

安装依赖：

```bash
pnpm install
```

创建本地环境变量文件：

```bash
cp .env.example .env
```

本地开发：

```bash
pnpm run dev
```

类型检查：

```bash
pnpm run typecheck
```

生产构建：

```bash
pnpm run build
```

## Cloudflare 配置

`wrangler.jsonc` 当前绑定：

- `D1`：邮件元数据数据库，绑定名 `D1`
- `R2`：邮件原始内容存储桶，绑定名 `R2`
- `triggers.crons`：`*/30 * * * *`
- 自定义域名：`smail.606055.xyz`

必须配置的 Worker Secret：

- `SESSION_SECRETS`：Cookie Session 签名密钥，支持逗号分隔多个值用于轮换。
- `API_TOKENS`：普通 API Token，逗号分隔。当前用于认证，但不授予跨邮箱读取权限。
- `ADMIN_API_TOKENS`：管理员 API Token，逗号分隔。可按邮箱地址读取邮件列表、邮件详情、验证码和附件。

生产环境设置：

```bash
pnpm wrangler secret put SESSION_SECRETS
pnpm wrangler secret put API_TOKENS
pnpm wrangler secret put ADMIN_API_TOKENS
```

本地开发可写入 `.env` 或 `.dev.vars`。如果存在 `.dev.vars`，Wrangler 本地开发时通常优先使用 `.dev.vars`。

## 管理员 Token

管理员 Token 不在后台页面配置，也不存入数据库。本阶段只使用 Cloudflare Secret 配置。

调用方式：

```http
Authorization: Bearer <ADMIN_API_TOKEN>
```

权限说明：

| 能力 | Session 用户 | 管理员 Token |
|---|---:|---:|
| 生成临时邮箱 | 支持 | 不需要 |
| 查询当前邮箱邮件列表 | 支持 | 支持 |
| 按地址查询邮件列表 | 不支持 | 支持 |
| 读取邮件详情 | 仅自己的地址 | 任意地址 |
| 提取验证码 | 仅自己的地址 | 任意地址 |
| 下载附件 | 仅自己的地址 | 任意地址 |

## API 调用

所有 JSON API 均设置 `Cache-Control: no-store`。

### 生成临时邮箱

```bash
curl -c cookie.txt -X POST https://smail.606055.xyz/api/address
```

响应：

```json
{
  "address": "name-abc123@606055.xyz",
  "addresses": ["name-abc123@606055.xyz"],
  "addressIssuedAt": 1782560000000,
  "expiresAt": 1782646400000
}
```

### 查询当前地址

```bash
curl -b cookie.txt https://smail.606055.xyz/api/address
```

### 查询邮件列表

Session 用户查询自己的邮箱：

```bash
curl -b cookie.txt https://smail.606055.xyz/api/emails
```

管理员按地址查询：

```bash
curl -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
  "https://smail.606055.xyz/api/emails?address=name-abc123@606055.xyz&limit=50"
```

返回：

```json
{
  "address": "name-abc123@606055.xyz",
  "emails": [
    {
      "id": "email-id",
      "to_address": "name-abc123@606055.xyz",
      "from_name": "Example",
      "from_address": "no-reply@example.com",
      "subject": "Your code",
      "time": 1782561234567
    }
  ]
}
```

### 查询邮件内容

Session 用户：

```bash
curl -b cookie.txt https://smail.606055.xyz/api/email/<email-id>
```

管理员：

```bash
curl -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
  https://smail.606055.xyz/api/email/<email-id>
```

返回字段：

- `body`：包裹样式后的 HTML 预览内容
- `html`：邮件原始 HTML 正文
- `text`：邮件纯文本正文
- `attachments`：附件元数据列表

## 验证码提取

默认提取 4 到 8 位数字验证码：

```bash
curl -b cookie.txt https://smail.606055.xyz/api/email/<email-id>/code
```

指定 6 位验证码：

```bash
curl -b cookie.txt "https://smail.606055.xyz/api/email/<email-id>/code?length=6"
```

管理员调用：

```bash
curl -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
  "https://smail.606055.xyz/api/email/<email-id>/code?length=6"
```

响应：

```json
{
  "code": "123456",
  "candidates": ["123456"],
  "source": "text"
}
```

## 附件下载

Session 用户：

```bash
curl -b cookie.txt -OJ \
  "https://smail.606055.xyz/api/email/<email-id>/attachment/<filename>"
```

管理员：

```bash
curl -H "Authorization: Bearer <ADMIN_API_TOKEN>" -OJ \
  "https://smail.606055.xyz/api/email/<email-id>/attachment/<filename>"
```

## 数据流

1. 邮件进入 Cloudflare Email Worker。
2. Worker 解析邮件元数据并写入 D1。
3. Worker 将原始邮件内容写入 R2，对象 key 为邮件 `id`。
4. 网页或 API 从 D1 查询邮件列表。
5. 打开邮件详情时，从 R2 读取原始邮件并解析正文、附件和验证码。

## 部署检查

发布前建议执行：

```bash
pnpm run typecheck
pnpm run build
```

部署：

```bash
pnpm run deploy
```

如果部署后发现线上版本与本地不一致，可检查：

```bash
pnpm wrangler deployments list --name smail
pnpm wrangler versions list --name smail
```

## 重要边界

- 本项目适合临时注册、验证码接收、测试和低风险短期收信。
- 不建议用于银行、工作、政务、法律、关键账号找回等高敏感场景。
- 当前 24 小时有效期主要体现在 session 可访问窗口和前端逻辑；数据库物理清理仍需后续完善。
