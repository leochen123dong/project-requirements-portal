# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目速览

系统集成商的全生命周期项目管理平台。售前 → 立项 → 交付 → 售后,5 个角色(售前/PM/交付/售后/管理员),**零本地依赖,部署到 GitHub 即可使用**。完整架构与数据模型见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);部署流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 常用命令

> 所有命令在 `web/` 目录下运行。

```bash
npm install              # 装依赖
npm run dev              # 开发服务器(localhost:5173)
npm run build            # 生产构建 → web/dist/
npm run preview          # 预览生产构建(localhost:4173)
npm run typecheck        # tsc --noEmit
npm test                 # Vitest 单测
npm run e2e              # Playwright E2E(需先 build + preview)
```

## 架构(高层)

```
web/src/pages/        # 路由级页面(8 个)
web/src/components/   # 共享 UI(Layout / RequireAuth / RoleGate / Drawer / Modal ...)
web/src/store/        # Zustand 状态(auth + ui)
web/src/api/          # supabase.ts + ithub.ts (Edge Function 调用)
web/src/hooks/        # useRealtime / useRole / useToast
web/src/types/contracts.ts  # ★ 共享契约(Zod schema + TS 类型)— 跨前后端唯一真实源
web/src/utils/rbac.ts       # 角色矩阵(纯 TS,前端 gate)
supabase/migrations/  # SQL: tables / RLS / triggers
supabase/functions/   # Deno Edge Functions(ithub-sync / ithub-push)
```

**关键约定**:前端类型与后端 schema 共用 `web/src/types/contracts.ts`。后端迁移后必须把 schema 同步到此文件;前端组件只从此处导入类型。

## 复用资源(项目内已有)

| 资源 | 路径 | 用途 |
|---|---|---|
| 设计 token | `web/src/styles/global.css` | 顶栏 / 按钮 / 表单 / 标签 / Modal / Drawer / Timeline 等组件样式。**新增组件只许复用 token,不许引入裸 hex 颜色。** |
| Vite + HashRouter | `web/vite.config.ts` + `web/src/main.tsx` | GH Pages SPA 兼容性已就位 |
| Deploy workflow | `.github/workflows/deploy-web.yml` | 推 main → 自动构建并发布到 GH Pages |
| 共享契约 | `web/src/types/contracts.ts` | 任何 DB schema 改动必须同步此文件 |
| RBAC 矩阵 | `web/src/utils/rbac.ts` | 任何权限改动必须同步 `docs/ROLES.md` 与后端 RLS |

## 扩展点

- **新增角色**:在 `types/contracts.ts` 的 `RoleEnum` 加枚举 → 在 `utils/rbac.ts` 的 `PAGE_PERMISSIONS` 加路由 → 在 `supabase/migrations/0002_rls.sql` 加 RLS policy → 在 `docs/ROLES.md` 加描述。
- **新增页面**:`web/src/pages/` 加 `.tsx` → `App.tsx` 加 `<Route>` → `utils/rbac.ts` 加权限 → 必要时 `types/contracts.ts` 加 schema。
- **新增 Edge Function**:`supabase/functions/<name>/index.ts` → `supabase functions deploy <name>` → `web/src/api/<name>.ts` 加调用 wrapper。
- **新增表**:`supabase/migrations/000N_<name>.sql`(追加文件,不要改旧文件以便回滚)→ `types/contracts.ts` 加 Zod → `api/supabase.ts` 的 Database 类型通过 `supabase gen types` 重生。

## 不要做

- 不要在 `web/src/components/` 引入新的依赖(组件优先用 HTML + 现有 token 实现)。
- 不要在 `web/src/` 直接调用 ITHub API —— 必须经过 `api/ithub.ts` 走 Edge Function,避免 API Key 泄露。
- 不要修改已合并的 migration 文件名 —— 新增用新文件。
- 不要在 CI workflow 中引入需要 Docker 的步骤(GH Actions 免费额度无 Docker layer cache)。

## 参考文档

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 数据模型 + 模块边界
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — 部署与故障排查
- [`docs/ROLES.md`](docs/ROLES.md) — 业务角色矩阵
- [`docs/adr/0001-supabase.md`](docs/adr/0001-supabase.md) — 为什么选 Supabase
- [`docs/adr/`(计划)](docs/adr/) — 后续决策的 ADR 索引