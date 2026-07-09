# 项目需求管理门户

> 系统集成商(网络 / 服务器 / 网络安全)的全生命周期项目管理平台。覆盖 **售前商机 → 立项 → 交付实施 → 验收 → 售后**。零本地依赖,直接部署到 GitHub 即可使用。

![phase](https://img.shields.io/badge/phase-v0.1-blue)
![stack](https://img.shields.io/badge/stack-React%20%2B%20Supabase-2B6CB0)

## 5 分钟部署

> 假设你已经有一个 GitHub 账号。

1. **Fork 本仓库** 到你的 GitHub 组织。
2. **创建 Supabase 项目**:打开 [supabase.com](https://supabase.com/dashboard) → New project → 记下 **Project URL** + **anon key** + **service_role key**。
3. **在本仓库 Settings → Secrets and variables → Actions** 添加两个 secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **(可选)添加 ITHub 凭证**(Secrets 中):
   - `ITHUB_API_BASE`(如 `https://your-ithub.example.com`)
   - `ITHUB_API_KEY`
   - `ITHUB_MOCK` = `false`(关闭 mock)
5. **在 Supabase SQL Editor** 依次执行 `supabase/migrations/0001_init.sql` → `0002_rls.sql` → `0003_triggers.sql`,然后 `supabase/seed.sql`。
6. **部署 Edge Functions**(可选):
   ```bash
   supabase functions deploy ithub-sync
   supabase functions deploy ithub-push
   supabase secrets set ITHUB_API_BASE=... ITHUB_API_KEY=...
   ```
7. **推送 main 分支**:`git push origin main` → GitHub Actions 自动构建并部署到 `https://<org>.github.io/<repo>/`。
8. **创建第一批用户**:在 Supabase Dashboard → Authentication → Users → Add user → 用魔法链接邀请 4 个 demo 账号,角色在 `profiles.role` 中设置(见 `docs/ROLES.md`)。

## 架构

```
GitHub Pages (前端静态 SPA · Vite + React + HashRouter)
        ↓  HTTPS (Supabase JS / fetch)
Supabase (云 · 免费额度)
  ├─ Auth       — 邮箱魔法链接登录
  ├─ Postgres   — 业务数据 + RLS 行级安全
  ├─ Realtime   — 项目动态 / 评论实时推送
  └─ Storage    — 项目交付物(HT-JL-* 文档、合同扫描件)
        ↓  Edge Functions (Deno)
ITHub API — 拉取工单 / SLA 计时器(可选,MOCK=true 走假数据)
```

详细架构、数据模型、扩展点见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 角色矩阵

| 角色 | 主要职责 | 默认菜单 |
|---|---|---|
| **presales**(售前) | 录入商机、走 7 阶段、上传 5 个交付物、触发立项交接 | 首页 · 商机 |
| **pm**(项目经理) | 接管立项项目、编辑里程碑、派任务、跟进 SLA | 首页 · 商机 · 项目 · 工单 |
| **delivery**(交付 / 实施) | 完成任务、上传交付物、反馈进度 | 首页 · 项目 |
| **postsales**(售后) | 跟踪 ITHub 工单 + SLA、跳转处理 | 首页 · 项目 · 工单 |
| **admin** | 看全局仪表盘、用户管理、触发 ITHub 同步 | 全部 |

权限边界见 [`docs/ROLES.md`](docs/ROLES.md);前端 gate 在 `web/src/utils/rbac.ts`,后端 RLS 在 `supabase/migrations/0002_rls.sql`。

## 目录结构

```
项目需求管理门户/
├── web/                          # 前端 (Vite SPA)
│   ├── src/
│   │   ├── pages/                # LoginPage, Dashboard, Opportunities, ...
│   │   ├── components/           # Layout, RequireAuth, RoleGate, ...
│   │   ├── api/                  # supabase.ts, ithub.ts
│   │   ├── store/                # authStore, uiStore (Zustand)
│   │   ├── hooks/                # useRealtime, useRole, useToast
│   │   ├── types/contracts.ts    # Zod schema + TS 类型(共享契约)
│   │   ├── utils/rbac.ts         # 角色矩阵(纯 TS)
│   │   └── styles/global.css     # 设计 token
│   └── playwright.config.ts      # E2E 配置
├── supabase/
│   ├── migrations/               # SQL: tables, RLS, triggers
│   ├── functions/                # ithub-sync / ithub-push (Deno)
│   ├── seed.sql                  # 演示数据
│   └── config.toml               # Supabase CLI 配置
├── e2e/                          # Playwright E2E 测试
├── .github/workflows/            # CI + Pages 部署
├── docs/                         # ARCHITECTURE / DEPLOY / ROLES / ADR
└── scripts/bootstrap.sh          # 一键引导脚本
```

## 本地开发(可选 — 平台本身不需要本地环境)

```bash
# 安装依赖
cd web && npm install

# 开发服务器
npm run dev      # → http://localhost:5173

# 类型检查 + 构建
npm run typecheck && npm run build

# 单元测试
npm test

# E2E 测试(需先 build + preview)
npm run build && npm run preview &
npm run e2e
```

## Demo 故事线(8 条验收用例)

| # | 故事 | 验收点 |
|---|---|---|
| 1 | 5 分钟部署 | GH Pages URL 打开即登录页 |
| 2 | 4 角色登录 | 看到不同菜单 |
| 3 | 售前→立项 | 商机走完 7 阶段 + 5 文档 → 项目创建 + PM 通知 |
| 4 | 交付里程碑 | PM 编辑 → delivery 实时看到更新 |
| 5 | 售后 SLA | postsales 看到 ITHub 工单 + SLA + 跳转 |
| 6 | 仪表盘 | 4 个 KPI 数字 + 与详情一致 |
| 7 | 协作 | 两个浏览器实时评论同步(< 1s) |
| 8 | CI | `npm test && npm run e2e` 全绿 |

## License

MIT