# ADR-0001: 为什么选 Supabase 作为后端

> **状态**:Accepted · **日期**:2026-07-09 · **作者**:PM

## 背景

项目需求管理门户需要一个后端,提供:
- 用户认证(5 个角色)
- 业务数据持久化(商机 / 项目 / 里程碑 / 任务 / 评论 / 交付物)
- 行级安全(每个角色只能看 / 改自己范围的数据)
- 实时推送(评论 / 进度实时同步)
- 文件存储(交付物文档)
- HTTP 代理 ITHub API(避免 API Key 暴露到前端)

硬约束:
- **零本地依赖**:用户最终只打开 URL 即可使用,不装 Node / DB / Docker。
- **直接部署到 GitHub**:仓库即交付物,别人 fork 即可继续。
- **预算敏感**:MVP 阶段无运维团队,免费或近免费为佳。

## 考虑的选项

### 选项 A:Supabase(本次采纳)

**优点**:
- 提供 Auth + Postgres + RLS + Realtime + Storage + Edge Functions 一站式
- 免费额度对 MVP 演示足够(500MB DB / 1GB Storage / 50k MAU / 500k Edge Function 调用)
- Edge Function (Deno) 适合代理 ITHub 调用 + 保护 API Key
- Postgres + RLS 是成熟的多租户隔离方案,优于自研
- 文档完善,Demo 速度快
- 官方 JS SDK `@supabase/supabase-js` 与前端契合度高

**缺点**:
- 供应商锁定(迁移到自建 PG 需要重写 RLS + Auth)
- 免费版项目 7 天不活跃会暂停(可手动唤醒)
- Edge Function 冷启动 ~250ms(对工单同步可接受)

### 选项 B:Firebase

**优点**:
- Google 生态、文档完善
- 实时推送(Cloud Firestore)原生支持
- Auth + Functions + Storage 都齐

**缺点**:
- **Firestore 没有行级安全**,权限必须在客户端 query 中拼接,容易漏
- 数据模型是 NoSQL,商机→项目→里程碑的关联查询需要反范式
- Functions 冷启动 ~1s

### 选项 C:Render / Railway 上的 Node.js + 自建 Postgres

**优点**:
- 控制力最强,任意 ORM / 任意库
- 可复用现有 NestJS / Express 经验

**缺点**:
- **违反零本地依赖约束**:至少需要 Postgres 服务,即使托管免费也要去 Neon / Supabase Postgres 拉一个
- 需自己实现实时(WS / SSE)、Auth、文件上传
- 5 个角色 + RLS 需要从零写,工作量巨大
- 与兄弟项目 `Logicalis项目管理平台/` 路线冲突(那是 Postgres + Docker)

### 选项 D:静态前端 + localStorage + 角色切换器

**优点**:
- 极致简单,无后端
- 部署只需 GH Pages

**缺点**:
- **不真正多人协作**,违反"多人共同协作"需求
- 数据无法跨设备同步
- 仅适合 5 分钟演示,不适合交付

## 决策

**采纳选项 A(Supabase)**。

理由总结:
1. 唯一同时满足"零本地依赖 + 真实多人协作 + 行级安全"的选项
2. 与前端技术栈(React + TypeScript)契合度最高
3. Edge Function 解决了 ITHub API Key 暴露问题
4. 兄弟项目 `Logicalis项目管理平台/` 已验证 Supabase 的可行性,只是走得更重(Postgres + Docker),本项目走轻量路线
5. 免费额度足够 MVP 演示;真上线后可平滑升级到 Pro($25/月)

## 后果

### 正面

- 开发速度:Auth + RLS + Realtime + Storage 全部现成,聚焦业务逻辑
- 部署成本:~$0(MVP)/ $25/月(正式)
- 运维成本:Supabase 官方托管,无需自管 DB

### 负面 / 风险

- 供应商锁定 → 通过 `web/src/api/supabase.ts` 单一入口隔离,未来可换
- 免费版项目暂停 → 文档中说明,生产前升级 Pro
- RLS 漏洞风险 → Phase 3 测试覆盖 `e2e/rbac.spec.ts`

### 缓解措施

| 风险 | 缓解 |
|---|---|
| 供应商锁定 | 业务逻辑在 `web/src/api/`,数据模型写在 `types/contracts.ts`;切换后端时只改 `api/` 与 `migrations/` |
| 免费版暂停 | README 标注,DEPLOY.md 写明升级路径 |
| RLS 漏洞 | Phase 3 E2E 覆盖 4 角色越权场景 + Vitest 单测 `rbac.test.ts` |
| Edge Function 冷启动 | TicketsPage 显示 loading 态;30 分钟 cron 预热高频项目 |

## 参考

- [`ITHub-API-分析/ITHub_API_AI_Native_Platform_Analysis.md`](../../ITHub-API-分析/ITHub_API_AI_Native_Platform_Analysis.md) — ITHub API 契约
- [`Logicalis项目管理平台/`](../../Logicalis项目管理平台/) — 重型 Supabase 路线参考(已存在,本项目不沿用)
- [`Demo环境/ITHub Demo/ITHub Portal Demo/`](../../Demo环境/ITHub%20Demo/ITHub%20Portal%20Demo/) — 轻量级 GH Pages + Render 参考

## 变更记录

- 2026-07-09:初稿(PM)