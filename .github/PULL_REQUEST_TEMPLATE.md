## 变更类型

- [ ] feat: 新功能
- [ ] fix: 修复
- [ ] refactor: 重构
- [ ] docs: 文档
- [ ] test: 测试
- [ ] build: 构建 / CI
- [ ] chore: 杂项
- [ ] perf: 性能

## 涉及范围

- [ ] 前端 (`web/src/`)
- [ ] 后端 SQL (`supabase/migrations/`)
- [ ] 后端 Edge Function (`supabase/functions/`)
- [ ] CI / Workflows (`.github/`)
- [ ] 文档 (`docs/`, `README.md`)
- [ ] 契约 (`web/src/types/contracts.ts`)

## 关联 Issue

<!-- 关联的 issue 编号,或 "无" -->

## 变更说明

<!-- 简短描述这次改动的动机 + 做法 -->

## 验证

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] (改动后端时)在 Supabase SQL Editor 中执行了新迁移
- [ ] (改动 RBAC 时)`utils/rbac.ts` 与 `migrations/0002_rls.sql` 已对齐
- [ ] (改动契约时)`types/contracts.ts` 与后端 schema 字段名一致

## 截图 / 录屏(可选)

<!-- UI 改动请附上前后对比 -->

## 验收清单

- [ ] 至少 1 位 reviewer 通过
- [ ] CI 全绿
- [ ] (如适用)文档已更新