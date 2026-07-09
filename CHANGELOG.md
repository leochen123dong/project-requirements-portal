# Changelog

所有版本的变更记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [v0.2.1] - 2026-07-10

小补丁:用户反馈调整。

### ✨ 新功能

**商机删除**
- `OpportunitiesPage` 加"删除"操作列(presales / admin 限定)
- `ConfirmDialog` 二次确认,提示级联删除影响范围
- 新增 `canDeleteOpportunity(role)` 权限 helper
- 新增 migration `0005_opportunity_delete_policy.sql`(presales + admin 可 DELETE)

### 🔥 移除

**工单(ITHub SLA)模块**
- 删除 `web/src/pages/TicketsPage.tsx` 与 `ITHubTicketCard.tsx` 组件
- 移除 Layout 顶栏"工单"tab
- 移除 App.tsx `/tickets` 路由
- 移除 `canSyncITHub` 与 `PAGE_PERMISSIONS.tickets`
- 移除 e2e `ithub-tickets.spec.ts` 与 `charts.spec.ts` 中的工单用例
- **保留**:Supabase 数据库 `ithub_tickets` / `ithub_sync_log` 表、`ithub-sync` / `ithub-push` Edge Functions 不动(如需恢复 UI 只需还原 page + tab + route)

## [v0.2.0] - 2026-07-10

增量版本。在 v0.1 已部署的基础上,新增 3 个能力。

### ✨ 新功能

**Admin 用户管理页**(`/admin/users`)
- 用 UI 邀请 / 修改角色 / 重置密码 / 删除用户,不再需要 SQL
- 后端:`supabase/functions/admin-users`(Deno Edge Function,持有 service_role)
- 前端:`AdminUsersPage` + `api/admin.ts`(类型化 wrapper)
- 操作权限:`canManageUsers(role)` — 仅 admin

**商机自定义字段**(`/admin/fields`)
- Schema-level:admin 定义字段列表(text / number / date / select),所有商机可用
- 后端:`migrations/0004_opportunity_custom_fields.sql`(2 张表 + RLS)
- 前端:`AdminCustomFieldsPage` + `OpportunitiesPage` 表单动态渲染 + 详情页展示
- 操作权限:`canManageCustomFields(role)` — 仅 admin

**图表(Recharts)**
- 全 4 个数据页都加:
  - 仪表盘:2 个 Donut(项目状态分布 + 商机阶段分布)
  - 项目页:Bar(状态分布)
  - 商机页:Bar(阶段分布)
  - 工单页:Bar(SLA 状态:超时 / 24h 内 / 正常,带颜色)
- 新增 3 个组件:`ChartCard` / `DonutChart` / `BarChart`
- 设计 token:`--chart-1..--chart-6` 在 `global.css`
- 零裸 hex,所有 chart 用 CSS 变量

### 🧪 测试覆盖

- **195 单测**(Vitest,+59):rbac / contracts / admin wrapper round-trip
- **41 E2E**(Playwright,+22):
  - `admin-users.spec.ts`(+8):admin 路径 + 非权限 gate(4 角色)
  - `custom-fields.spec.ts`(+6):admin 字段页 + presales regression
  - `charts.spec.ts`(+5):4 数据页 chart-card wiring
  - `rbac.spec.ts`(+3):v0.2 admin gates
  - `auth.spec.ts`(重写):适配 v0.1 密码登录模式

### 📦 度量

- 构建:**647 kB JS / 188 kB gzipped**(v0.1 是 275 kB / 85 kB;+Recharts 占 ~90 kB gzipped)
- 单测:511ms(目标 < 5s)
- E2E:2.5s(目标 < 10s)
- 新增 7 个文件 + 8 个改动,共 ~1500 行代码

### ⚠️ 部署注意

`migrations/0004_opportunity_custom_fields.sql` 需要手动在 Supabase SQL Editor 跑(或 `supabase db push`)。Admin 操作相关的 Edge Function(`admin-users`)在用户环境跑 — 通过 `supabase functions deploy admin-users` 部署。

## [v0.1.0] - 2026-07-09

首个可发布版本。从空仓库到完整可部署项目的 4 个 Phase 协作产出。

### ✨ 新功能

**售前 → 立项**
- 商机列表 + 阶段筛选(线索 / 已验证 / 方案中 / 谈判中 / 成交 / 丢单)
- 商机详情 + 5 个交付物(HT-JL-01/02/03-1, SOW, Contract)上传清单
- 立项交接流程(选择 PM → 自动创建项目 → 跳转项目详情)
- presales / admin 角色 gate

**交付与里程碑**
- 项目列表 + 状态筛选(initiated / in_progress / accepted / closed)
- 项目详情:里程碑时间轴(状态色:已完成 = 绿 / 进行中 = 蓝 / 阻塞 = 红)+ 任务清单(可勾选 / 派单)+ 评论(Supabase Realtime 实时同步)
- ArtifactUploader:文件上传到 Supabase Storage `artifacts` bucket
- pm / delivery / postsales 角色 gate

**售后 SLA**
- 工单列表(来自 ITHub,带 SLA 倒计时):红 < 4h / 橙 < 24h / 绿 > 24h
- 手动同步按钮 → 调 Edge Function 拉取最新工单
- "在 ITHub 中打开" 链接(`ithubTicketUrl` helper)
- mock 模式:`VITE_ITHUB_MOCK=true` 时显示 3 条假工单(无需 ITHub 实例)

**管理仪表盘**
- 4 个 KPI:进行中项目 / 超期任务 / 本周即将到期里程碑 / 人均负载
- ITHub 最近同步时间 + 拉取条数
- 最近活动流(`audit_log` 最近 10 条)
- admin 角色 gate

**认证**
- 邮箱魔法链接登录(Supabase Auth `signInWithOtp`)
- 5 角色权限矩阵(presales / pm / delivery / postsales / admin)
- 自动创建 profile 行(auth.users trigger)
- 角色变更防越权:profile.role 仅 admin / service_role 可改

### 🏗️ 架构

- **前端**:React 18 + TypeScript + Vite + HashRouter(GitHub Pages SPA 兼容)
- **状态**:Zustand(auth + ui,带 persist 中间件)
- **数据**:@supabase/supabase-js v2(强类型 Database)
- **后端**:Supabase(Postgres 15 + RLS + Auth + Realtime + Storage + Edge Functions)
- **ITHub 集成**:Edge Function (Deno) 代理,API Key 服务端持有
- **样式**:原生 CSS + 设计 token(从 ITHub Portal Demo 复用)

### 📦 部署

- GitHub Actions:推 main → 自动 build → 部署到 GitHub Pages
- 零本地依赖:用户只需 fork + 配置 Supabase + 填 secrets
- Supabase CLI:迁移 / Edge Functions 一键部署
- `scripts/bootstrap.sh` 引导脚本(打印 6 步操作)

### 🧪 测试

- **136 单测**(Vitest)全绿:
  - rbac.ts:81 tests(覆盖 5 角色 × 所有操作的矩阵)
  - contracts.ts:41 tests(Zod schema round-trip)
  - authStore:7 tests(persist 中间件)
  - ithub.ts:7 tests(URL helper + mock data shape)
- **16 E2E**(Playwright + Chromium)全绿:
  - 认证 / 导航 / RBAC / ITHub mock / 路由 gate
  - 2 个 Supabase-gated 测试在 secrets 缺失时优雅跳过
- **CI**:lint-and-test job + e2e job(secrets 触发)
- 总耗时:单测 461ms,E2E 1.8s

### 📚 文档

- `README.md` — 5 分钟部署 + 架构图 + 角色矩阵
- `CLAUDE.md` — Claude Code 项目指引(命令 / 架构 / 复用资源 / 扩展点)
- `docs/ARCHITECTURE.md` — 详细数据模型 + 模块边界 + 数据流
- `docs/DEPLOY.md` — 部署步骤 + 故障排查 + 升级 + 回滚
- `docs/ROLES.md` — 5 角色业务说明 + 操作权限矩阵
- `docs/adr/0001-supabase.md` — 为什么选 Supabase(Firebase / Render / 纯静态对比)
- `scripts/bootstrap.sh` — 6 步引导脚本

### 🔧 待补 / 已知限制

需要用户提供 Supabase 项目 + 可选 ITHub 凭证才能跑通完整故事线。代码已就位:
- Supabase migrations SQL:`supabase/migrations/{0001_init, 0002_rls, 0003_triggers}.sql`
- ITHub Edge Functions:`supabase/functions/{ithub-sync, ithub-push}/index.ts`
- Demo 数据:`supabase/seed.sql`(5 profiles / 2 opportunities / 1 project / 3 milestones / 5 tasks / 3 tickets)

详见 README 的 "5 分钟部署" 章节与 `docs/DEPLOY.md`。

### 📈 度量

- 源码文件:67(含 14 组件 + 8 页面 + 4 单测 + 5 E2E)
- 构建产物:274 kB JS (gzip 85 kB) + 10 kB CSS
- 首次构建时间:0.4s(134 modules transformed)
- 5 个 git commits:`phase-0` → `phase-3`