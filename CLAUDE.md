# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目速览

系统集成商的全生命周期项目管理平台。**v0.4.1 已部署** GH Pages(`https://leochen123dong.github.io/project-requirements-portal/`) + Supabase(项目 ref `hicjyijwtcfzzlvgglqy`)。零本地依赖,纯云。

**5 个角色**:presales / pm / delivery / postsales / admin
**核心流程**:售前商机 → 立项交接(handover)→ 交付项目 → 售后(工单模块 v0.2.1 移除,ITHub 集成代码保留作未来扩展)

业务说明 [`docs/ROLES.md`](docs/ROLES.md) · 架构 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · 部署 [`docs/DEPLOY.md`](docs/DEPLOY.md) · 变更 [`CHANGELOG.md`](CHANGELOG.md)。

## 常用命令

所有命令在 `web/` 目录下运行。

```bash
npm install              # 装依赖
npm run dev              # 开发服务器(localhost:5173)
npm run build            # 生产构建 → web/dist/
npm run preview          # 预览生产构建(localhost:4173)
npm run typecheck        # tsc -b --noEmit
npm test                 # Vitest 单测(209 个, ~0.5s)
npm run e2e              # Playwright E2E(50 个 + 2 Supabase-gated skip, ~3s)
npm run e2e:install      # 安装 Chromium(本地首次需要)
```

部署: `scripts/bootstrap.sh` 打印 6 步流程。**Edge Function `admin-users` 已部署**(v0.4.1)。

## 跨文件契约(单一真实源)

> **最重要**。改 schema / 角色 / 页面必须同步,否则类型对不上或 RLS 漏洞。

```
                  ┌─────────────────────────────────────────────┐
                  │ web/src/types/contracts.ts                 │  Zod schema + TS 类型
                  │   - 11 个 Schema + AdminUserAction/Record  │  ← 后端 11 个 migration 的镜像
                  │   - 枚举值与 SQL CHECK 严格一致             │
                  └──────────────┬──────────────────────────────┘
                                 │ 同步
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌────────────────┐    ┌─────────────────────┐   ┌─────────────────────┐
│ supabase/      │    │ web/src/api/        │   │ web/src/utils/      │
│ migrations/    │    │ supabase.ts         │   │ rbac.ts             │
│ 0001..0011.sql │    │ (Database 类型)     │   │ (角色矩阵 + canXxx)  │
│ + 0002_rls.sql │    │ + ithub.ts (wrapper)│   │ canManage* helpers  │
└────────────────┘    └─────────────────────┘   └─────────────────────┘
                                 ▲
                                 │ 通过 supabase.functions.invoke('admin-users')
                                 │
            ┌────────────────────┴───────────────────┐
            │ supabase/functions/admin-users/        │
            │ (已部署 · Edge Function Deno)          │
            │   actions: list / invite / update-role  │
            │   / set-password / delete               │
            └────────────────────────────────────────┘
```

**改动时的同步清单**:
- **改后端表**:`supabase/migrations/001N_*.sql`(追加 0012+ 文件,不要改 0001-0011)→ 同步 `contracts.ts` 的 Zod + `supabase.ts` 的 Database 类型
- **改角色**:在 `contracts.ts` `RoleEnum` 加值 → `rbac.ts` 加 `PAGE_PERMISSIONS` + helper → `0002_rls.sql` 加 policy → `docs/ROLES.md` 加权限行
- **改页面**:`web/src/pages/*.tsx` → `App.tsx` 加 `<Route>` → `rbac.ts` 加权限 → 必要时 `contracts.ts` 加 schema
- **改 admin 页面**:`web/src/pages/Admin*.tsx` → `App.tsx` 路由 → `Layout.tsx` 加 admin tab → `rbac.ts` 加 `canManageXxx` helper

## 非显式陷阱(踩过)

### 1. `asTypedClient` 强制转换 + `client!` 非空断言

`api/supabase.ts` 的 `Database` 类型**手写**,没给每个表加 `Relationships: []` 字段。postgrest-js 的 `Schema` 类型推断因此把 `.update() / .insert()` 的参数推断成 `never`,写操作 TS 报错。

**修复在 `web/src/hooks/useSupabaseClient.ts`** —— 提供 `asTypedClient(supabase)` 返回 `as unknown as PatchedClient<Database>` 的客户端。

**重要**:`asTypedClient(supabase)` 的返回类型是 `... | null` — Supabase env 未配置时返回 null。所有调用点必须用 `client!.foo()`(非空断言,在 `if (!supabaseConfigured) return` early-return 之后调用,Supabase 必然已配置)。

**永远不要**在调用点写 `as any`。

### 2. CI 的 rollup 可选依赖坑

`rollup@4.x` 在 `optionalDependencies` 声明 ~25 个平台特定二进制。npm 写 `package-lock.json` 时,对当前平台不安装的那些会写成 `{ dev: true, optional: true }`(无 version 字段)。npm 10/11 在 amd64 容器里读这个 lock 会报 `Invalid Version:`。

**已验证**:CI 三个 workflow 都用 `npm install --no-audit --no-fund --prefer-offline`。**别再回到 `npm ci` 或加 `optional=false`**(`optional=false` 会跳掉 amd64 binary 导致 `Cannot find module @rollup/rollup-linux-x64-gnu`)。

### 3. React hooks 顺序规则(踩过 2 次)

`/scripts/...` 的所有页面文件**容易写错**:早返回 (`if (!client) return ...`) 必须放在**所有 hooks 调用之后**。否则 React 报 **`#310 Rendered more hooks than during the previous render`**。

**正确模式**(`web/src/pages/OpportunityDetailPage.tsx` 是最复杂例子):
```ts
export default function Page() {
  // 1. 所有 hooks 先调(无条件)
  const [a, setA] = useState(...);
  const canX = useMemo(...);
  const data = useQuery(...);
  // 2. 然后才早返回
  if (!client) return <EmptyState />;
  if (!opp) return <EmptyState />;
  // 3. 最后 JSX
  return <div>...</div>;
}
```

### 4. mock 降级模式(无 Supabase env 时不崩)

当 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 未配置时,`api/supabase.ts` 返回 `null`。所有调用点必须做 `if (!client) return <EmptyState />;` 而**不是** throw。E2E 的 `addInitScript` 用 `localStorage.setItem('pm-portal-auth', ...)` 注入假 session 绕过 RequireAuth 而不改源码。

### 5. Edge Function 必须部署才能用

代码完整 ≠ 功能可用。`supabase/functions/admin-users/index.ts` 在仓库里,但必须 `supabase functions deploy admin-users` 才能调通。**类似还有 `ithub-sync` / `ithub-push` (ITHub 工单 v0.2.1 UI 移除但 Edge Function 保留)**。

```bash
# 一次性
supabase login
supabase link --project-ref hicjyijwtcfzzlvgglqy
supabase functions deploy admin-users
supabase functions deploy ithub-sync    # 若要用 ITHub SLA
supabase functions deploy ithub-push    # 若要回写 ITHub
```

### 6. seed.sql 的 UUID 必须匹配 `auth.users`

`supabase/seed.sql` 里的 profiles 用固定 UUID(`11111111-1111-1111-1111-111111111111` 等)。Supabase Auth 创建用户时**自动分配 UUID**,你不能预设。

**正确流程**:
1. Supabase Dashboard → **Authentication → Users → Add user** → 创建 5 个 demo 账号
2. 复制每个用户分配的 UUID
3. 改 `seed.sql` 里的固定 UUID(或跑 v0.3 的 update SQL,直接用 email 匹配)
4. 重跑 `seed.sql`

### 7. 后端变更不许改旧 migration

`supabase/migrations/` 只追加(0001-0011 已合并)。新建 0012+ 用于任何 schema 变更,以便 `supabase db reset` 后能顺序回放。

### 8. `OpportunityDetailPage` 是 monorepo 最复杂的页面

这个文件 ~1300 行,有 8 个 modal(state)、realtime 订阅、5 个 fetch 并行。每次改都要小心 hooks 顺序(陷阱 #3)。建议改之前跑 `npm test` 验证(虽然 unit test 不能直接 cover 这个文件,但能 catch 类型错误)。

## 模块边界

| 目录 | 职责 | 关键约束 |
|---|---|---|
| `web/src/types/contracts.ts` | **前后端共享契约**,Zod + TS | 后端改动必同步 |
| `web/src/api/supabase.ts` | typed client + helpers | 仅 Database 类型随 schema 同步 |
| `web/src/api/admin.ts` | 调用 admin-users Edge Function 的 typed wrappers | 加新 action 时同步 `contracts.ts` AdminUserAction |
| `web/src/utils/rbac.ts` | 角色矩阵 + 5 个 canXxx helper | 后端 RLS 是 source of truth |
| `web/src/components/` | 18 个共享 UI(含 ChartCard/BarChart/DonutChart v0.3) | 优先用 `global.css` 现有 class,**不新引入依赖** |
| `web/src/pages/` | 11 个路由页面 | 包含 4 个 admin 页(Users/Fields/Tags/Artifacts) + 1 个仪表盘 |
| `web/src/store/` | Zustand(auth + ui) | authStore 持久化 profile,带 loading flag 防 race |
| `web/src/hooks/` | useRealtime / useRole / useToast / useSupabaseClient | useSupabaseClient 是 §1 workaround |
| `supabase/migrations/` | 11 个 SQL(只追加) | 0001-0011 已合并,新增 0012+ |
| `supabase/functions/` | Deno Edge Functions | admin-users 已部署,ithub-sync/push 待部署 |
| `supabase/seed.sql` | 演示数据(5 users + 2 opps + 项目 + 任务) | UUID 必须匹配 auth.users(见陷阱 #6) |
| `web/e2e/` | Playwright 套件(6 个 spec) | `opportunity-detail.spec.ts` + 5 个其他 |
| `.github/workflows/` | ci.yml + deploy-web.yml | ci.yml 的 e2e job 由 secrets 触发 |

## 设计系统

所有视觉规范在 `web/src/styles/global.css` 一个文件,设计 token 通过 CSS 变量暴露:

```css
--brand-primary: #2B6CB0;   /* 蓝 */
--brand-accent:  #ED8936;   /* 橙 */
--topnav-dark-bg: #1f2937;  /* 顶栏深色 */
--success: #38A169; --danger: #E53E3E; --warning: #DD6B20;
--chart-1..--chart-6:     /* 6 色 chart 调色板(v0.3) */
--radius: 8px; --shadow-md: 0 4px 12px rgba(0,0,0,.06);
```

**新增组件只许复用 token + 现有 class**(`btn-primary` / `card` / `modal-overlay` / `timeline` / `sla-countdown` / `tag-*` / `table` / `topnav-dark` / `kpi-tile` 等)。**禁止引入裸 hex 颜色或新 CSS 框架**。

## 测试覆盖

- **单测 209 个**(Vitest + jsdom,~0.5s):
  - `utils/rbac.test.ts`(83):5 角色 × 所有操作的矩阵断言
  - `types/contracts.test.ts`(93):11 个 Zod schema round-trip
  - `store/authStore.test.ts`(7):Zustand persist + loading flag 防 race
  - `api/admin.test.ts`(9):AdminError + callAdmin 包装测试
  - `api/ithub.test.ts`(7):URL helper + mock data shape
- **E2E 50 个 + 2 skip**(Playwright + Chromium,~3s):
  - `auth.spec.ts` / `navigation.spec.ts` / `rbac.spec.ts`:认证 + 路由 gate + RBAC 矩阵(无需 Supabase)
  - `opportunity-detail.spec.ts`(12):v0.3/v0.4 阶段 UI 测试(presales/pm 角色差异)
  - `opportunity-staff-tags-artifacts.spec.ts`(已合并到上面 spec,无独立文件)
  - `opportunity-to-project.spec.ts`:完整售前→立项故事线(需 `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` secrets)

CI 的 `e2e` job 用 secrets gate,无 secrets 时优雅跳过 Supabase-gated 用例。

## 不要做

- ❌ 不要在 `web/src/api/` 直接调用 `fetch('https://ithub.example.com/...')` —— 必须经 Edge Function
- ❌ 不要改 `0001` - `0011` 任何 migration —— 用新文件追加(0012+)
- ❌ 不要在 CI 加 `optional=false` 或 `npm ci` —— 见陷阱 #2
- ❌ 不要在 `web/src/components/` 引入新依赖 —— 用 HTML + 现有 token 实现
- ❌ 不要写 `as any` —— DB 写操作用 `asTypedClient(supabase)`(陷阱 #1)
- ❌ 不要在页面里 throw 当 Supabase 未配置 —— 用 mock 降级 + EmptyState(陷阱 #4)
- ❌ 不要新增角色时只改 `RoleEnum` —— RLS / rbac.ts / docs/ROLES.md 都要同步
- ❌ 不要在 CI workflow 加 Docker 步骤 —— GH Actions 免费额度无 Docker layer cache
- ❌ 不要在 OpportunityDetailPage 早返回**前**调用 hooks —— React #310(陷阱 #3)

## 参考文档

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 完整数据模型 + 模块边界 + 数据流图
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — 5 分钟部署 + 故障排查 + 升级回滚
- [`docs/ROLES.md`](docs/ROLES.md) — 业务角色 + 操作权限矩阵
- [`docs/adr/0001-supabase.md`](docs/adr/0001-supabase.md) — 为什么选 Supabase
- [`CHANGELOG.md`](CHANGELOG.md) — v0.1.0 → v0.4.1 全部 release notes
- [`README.md`](README.md) — 一页上手 + 默认账号 + 架构图
- [`plans/rosy-riding-koala.md`](plans/rosy-riding-koala.md) — v0.3/v0.4 实施计划(参考过往决策)