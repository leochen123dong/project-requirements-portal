# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目速览

系统集成商的全生命周期项目管理平台。售前 → 立项 → 交付 → 售后,5 个角色(presales / pm / delivery / postsales / admin),**零本地依赖,部署到 GitHub + Supabase 即可使用**。本仓库由 4 人 agent 团队(PM + frontend-dev + backend-dev + tester)在 4 个 Phase 协作产出。完整业务说明见 [`docs/ROLES.md`](docs/ROLES.md),架构与数据模型见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),部署流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 常用命令

所有命令在 `web/` 目录下运行。

```bash
npm install              # 装依赖
npm run dev              # 开发服务器(localhost:5173)
npm run build            # 生产构建 → web/dist/
npm run preview          # 预览生产构建(localhost:4173)
npm run typecheck        # tsc --noEmit
npm test                 # Vitest 单测(136 个, ~0.5s)
npm run e2e              # Playwright E2E(16 个 + 2 Supabase-gated skip)
npm run e2e:install      # 安装 Chromium(本地首次需要)
```

部署与配置见 `scripts/bootstrap.sh`(打印 Supabase 项目创建 + GH repo 推送 + 迁移执行的 6 步)。

## 跨文件契约(单一真实源)

> **最重要的一节**。改 schema / 角色 / 页面时,这几个文件必须**同步改**,否则类型对不上或 RLS 漏洞。

```
                  ┌─────────────────────────────────────────────┐
                  │ web/src/types/contracts.ts                 │  Zod schema + TS 类型
                  │   - Profile / Opportunity / Project / ...   │  ← 后端 schema 的镜像
                  │   - 枚举值与 SQL CHECK 严格一致             │
                  └──────────────┬──────────────────────────────┘
                                 │ 同步
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌────────────────┐    ┌─────────────────────┐   ┌─────────────────────┐
│ supabase/      │    │ web/src/api/        │   │ web/src/utils/      │
│ migrations/    │    │ supabase.ts         │   │ rbac.ts             │
│ 0001_init.sql  │    │ (Database 类型)     │   │ (角色矩阵 + canXxx)  │
│ + 0002_rls.sql │    │                     │   │                     │
└────────────────┘    └─────────────────────┘   └─────────────────────┘
```

- **改后端表**:`supabase/migrations/000N_*.sql`(追加文件,不要改 0001-0003)→ 同步 `contracts.ts` 的 Zod schema + `supabase.ts` 的 Database 类型(可 `supabase gen types typescript` 重生)
- **改角色**:在 `contracts.ts` 的 `RoleEnum` 加值 → 在 `rbac.ts` 的 `PAGE_PERMISSIONS` 与 `canXxx()` helper 加逻辑 → 在 `0002_rls.sql` 加 RLS policy → 在 `docs/ROLES.md` 加权限矩阵行
- **改页面**:`web/src/pages/*.tsx` → `App.tsx` 加 `<Route>` → `rbac.ts` 加权限检查 → 必要时 `contracts.ts` 加 schema

## 非显式陷阱(踩过)

### 1. `useSupabaseClient.ts` 的 `asTypedClient` 强制转换

`api/supabase.ts` 的 `Database` 类型是手写的,**没有给每个表加 `Relationships: []` 字段**。postgrest-js 的 `Schema` 类型推断会因此把 `.update()` / `.insert()` 的参数推断成 `never`,所有写操作 TS 报错。

修复在 `web/src/hooks/useSupabaseClient.ts` —— 提供 `asTypedClient(supabase)` 返回一个 `as unknown as PatchedClient<Database>` 的客户端。所有写操作页面都从这里拿 client,**不要在调用点写 `as any`**。等未来跑 `supabase gen types` 重生 Database 类型后可去掉这个 hook。

### 2. CI 的 rollup 可选依赖坑

`rollup@4.x` 在 `optionalDependencies` 里声明 ~25 个平台特定二进制。npm 写 `package-lock.json` 时,对当前平台不安装的那些会写成 `{ dev: true, optional: true }`(无 version 字段)。npm 10/11 在 amd64 容器里读这个 lock 会报 `Invalid Version:`。

**已验证的修复**:`npm install --no-audit --no-fund`(不要用 `npm ci`,严格;不要加 `optional=false`,会跳掉 amd64 binary 导致构建失败)。三个 workflow 都已用此命令。**别再回到 `npm ci` 或加 `optional=false`。**

### 3. mock 降级模式(无 Supabase env 时不崩)

当 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 未配置时,`api/supabase.ts` 返回 `null`(不是 client)。所有调用点必须做 `if (!client) return <EmptyState />;` 或类似空状态,而**不是** throw。`TicketsPage` 已有专门的 "演示模式" 入口(显示 3 条 mock 工单)。E2E 的 `addInitScript` 用同样的方式注入假 session 绕过 RequireAuth 而不改源码。

### 4. seed.sql 的 UUID 必须匹配 `auth.users`

`supabase/seed.sql` 里的 profiles 用固定 UUID(`11111111-1111-1111-1111-111111111111` 等)。Supabase Auth 的 `auth.users.id` 不接受手动设值,需要在 Dashboard 创建 5 个 demo 用户后**复制生成的 UUID 回 seed.sql 改**。详见 seed.sql 顶部注释。

### 5. 后端变更不许改旧 migration

`supabase/migrations/` 只追加(0001 / 0002 / 0003 已合并)。新建 0004+ 用于任何 schema 变更,以便 `supabase db reset` 后能顺序回放。

## 模块边界

| 目录 | 职责 | 谁能改 |
|---|---|---|
| `web/src/types/contracts.ts` | **前后端共享契约**,Zod + TS | 后端改动必同步 |
| `web/src/api/supabase.ts` | typed client + helpers | 仅 Database 类型随 schema 同步 |
| `web/src/api/ithub.ts` | ITHub Edge Function 调用 wrapper,**前端绝不直连 ITHub** | 改 Edge Function 时同步 |
| `web/src/utils/rbac.ts` | 角色矩阵(纯 TS,前端 gate) | 后端 RLS 是 source of truth |
| `web/src/components/` | 17 个共享 UI | 优先用 `global.css` 现有 class,不新引入依赖 |
| `web/src/pages/` | 8 个路由页面 | 每个页面 = 一个路由,业务逻辑集中 |
| `web/src/store/` | Zustand stores | authStore 持久化 profile,uiStore 管 toast/drawer |
| `web/src/hooks/` | useRealtime / useRole / useToast / useSupabaseClient | useSupabaseClient 是上面 §1 的 workaround |
| `supabase/migrations/` | SQL 迁移 | 只追加 |
| `supabase/functions/` | Deno Edge Functions | `ithub-sync` 拉数据 / `ithub-push` 回写,均 JWT 校验 |
| `supabase/seed.sql` | 演示数据 | UUID 改要匹配 auth.users |
| `e2e/` | Playwright 套件 | 5 个 spec,`opportunity-to-project` 需要 Supabase secrets |
| `.github/workflows/` | CI + Pages 部署 | ci.yml 的 e2e job 由 secrets 触发 |

## 设计系统

所有视觉规范在 `web/src/styles/global.css` 一个文件,设计 token 通过 CSS 变量暴露:

```css
--brand-primary: #2B6CB0;   /* 蓝 */
--brand-accent:  #ED8936;   /* 橙 */
--topnav-dark-bg: #1f2937;  /* 顶栏深色 */
--success: #38A169; --danger: #E53E3E; --warning: #DD6B20;
--radius: 8px; --shadow-md: 0 4px 12px rgba(0,0,0,.06);
```

**新增组件只许复用 token + 现有 class**(`btn-primary` / `card` / `modal-overlay` / `timeline` / `sla-countdown` / `tag-*` / `table` / `topnav-dark` / `kpi-tile` 等)。**禁止引入裸 hex 颜色或新 CSS 框架**。

## 测试覆盖

- **单测** 136 个(Vitest + jsdom):
  - `utils/rbac.test.ts`(81):5 角色 × 所有操作的矩阵断言
  - `types/contracts.test.ts`(41):10 个 Zod schema round-trip
  - `store/authStore.test.ts`(7):Zustand persist 中间件
  - `api/ithub.test.ts`(7):URL helper + mock data shape
- **E2E** 16 + 2 skip(Playwright + Chromium):
  - `auth.spec.ts` / `navigation.spec.ts`:认证 + 路由 gate(无需 Supabase)
  - `rbac.spec.ts`:RBAC 矩阵 vs `docs/ROLES.md`
  - `ithub-tickets.spec.ts`:mock 模式 + SLA 倒计时渲染
  - `opportunity-to-project.spec.ts`:完整售前→立项故事线(需 `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` secrets)

CI 的 `e2e` job 用 secrets gate,无 secrets 时优雅跳过 Supabase-gated 用例,其他用例仍跑。

## 不要做

- ❌ 不要在 `web/src/api/` 直接调用 `fetch('https://ithub.example.com/...')` —— 必须经 `api/ithub.ts` 走 Edge Function,避免 ITHub API Key 泄露
- ❌ 不要改 `0001_init.sql` / `0002_rls.sql` / `0003_triggers.sql` —— 用新文件追加(0004+)
- ❌ 不要在 CI 加 `optional=false` 或 `npm ci` —— 见上面 §2
- ❌ 不要在 `web/src/components/` 引入新依赖 —— 用 HTML + 现有 token 实现
- ❌ 不要写 `as any` —— DB 写操作用 `asTypedClient(supabase)`(见 §1)
- ❌ 不要在页面里 throw 当 Supabase 未配置 —— 用 mock 降级 + EmptyState(见 §3)
- ❌ 不要新增角色时只改 `RoleEnum` —— RLS / rbac.ts / docs/ROLES.md 都要同步
- ❌ 不要在 CI workflow 加 Docker 步骤 —— GH Actions 免费额度无 Docker layer cache

## 参考文档

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 完整数据模型 + 模块边界 + 数据流图
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — 5 分钟部署 + 故障排查 + 升级回滚
- [`docs/ROLES.md`](docs/ROLES.md) — 业务角色 + 操作权限矩阵
- [`docs/adr/0001-supabase.md`](docs/adr/0001-supabase.md) — 为什么选 Supabase
- [`CHANGELOG.md`](CHANGELOG.md) — v0.1.0 release notes(架构 + 测试度量)
- [`README.md`](README.md) — 一页上手 + 默认账号 + 架构图