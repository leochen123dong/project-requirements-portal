# 架构

> 详细的数据模型 + 模块边界 + 数据流 + 扩展点。

## 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  React 18 + Vite + HashRouter (GH Pages)              │  │
│  │  Zustand (authStore + uiStore) + Zod (contracts)      │  │
│  └──────┬──────────────────────────────────────────┬──────┘  │
└─────────┼──────────────────────────────────────────┼─────────┘
          │ supabase-js (HTTPS)                    │ Edge Function invoke
          ▼                                          ▼
┌─────────────────────────────────┐    ┌──────────────────────────────┐
│  Supabase                       │    │  Supabase Edge Functions     │
│  ┌──────────────────────────┐   │    │  (Deno, serverless)          │
│  │  Auth (魔法链接)         │   │    │                              │
│  │  Postgres (业务数据)     │◀──┼────│  ithub-sync                  │
│  │    + RLS (行级安全)      │   │    │    GET /api/ServiceDesk/...  │
│  │  Realtime (评论/进度)    │   │    │                              │
│  │  Storage (交付物文件)    │   │    │  ithub-push                  │
│  └──────────────────────────┘   │    │    POST /api/ServiceDesk/... │
└─────────────────────────────────┘    └──────────────┬───────────────┘
                                                     │ HTTPS + ApiKey
                                                     ▼
                                          ┌──────────────────────┐
                                          │  ITHub (用户实例)    │
                                          │  ServiceDesk API     │
                                          └──────────────────────┘
```

## 数据模型

> Phase 1 后端 agent 实现细节。本节是 PM 维护的"目标态"文档。

```
profiles              opportunities           projects
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│ id (uuid)   │◀──────│ owner_id     │       │ id           │
│ display_name│       │ name         │       │ opportunity_id ──▶ opportunities
│ role (enum) │       │ customer     │       │ name         │
│ created_at  │       │ amount       │       │ pm_id ────────▶ profiles
└─────────────┘       │ stage (enum) │       │ status (enum)│
        ▲             │ created_at   │       │ ithub_ticket_id
        │             └──────────────┘       │ created_at   │
        │                                     └──────┬───────┘
        │                                            │
        │           ┌──────────────┐                 ▼
        │           │ comments     │          ┌──────────────┐
        └───────────│ author_id    │          │ milestones   │
                    │ target_type  │◀─────────│ project_id   │
                    │ target_id    │          │ name         │
                    │ body         │          │ phase        │
                    │ created_at   │          │ due_date     │
                    └──────────────┘          │ status (enum)│
                                              │ order        │
                                              └──────┬───────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │ tasks        │
                                              │ milestone_id │
                                              │ assignee_id ──▶ profiles
                                              │ title        │
                                              │ done (bool)  │
                                              │ due_date     │
                                              └──────────────┘

artifacts                                    ithub_tickets
┌──────────────┐                             ┌──────────────┐
│ project_id   │                             │ project_id   │
│ type (enum)  │                             │ ithub_id     │
│  - HT-JL-01  │                             │ subject      │
│  - HT-JL-02  │                             │ status       │
│  - HT-JL-03-1│                             │ sla_breach_at│
│  - SOW       │                             │ last_synced_at│
│  - CONTRACT  │                             └──────────────┘
│ storage_path │
│ uploaded_by  │                             audit_log
│ created_at   │                             ┌──────────────┐
└──────────────┘                             │ actor_id     │
                                             │ action       │
                                             │ entity       │
                                             │ entity_id    │
                                             │ at           │
                                             └──────────────┘
```

## 模块边界

### 前端 (`web/src/`)

| 目录 | 职责 |
|---|---|
| `pages/` | 路由级页面。每个文件 = 一个 `<Route>` 组件。 |
| `components/` | 跨页面复用的 UI 组件。**优先复用现有 token,不要新引入设计元素**。 |
| `api/` | 外部数据源的薄包装(supabase + ithub)。**所有 supabase/ithub 调用都集中在这里**,业务组件不直接 import supabase。 |
| `store/` | Zustand store。authStore 持久化 profile,uiStore 管理 toast / drawer。 |
| `hooks/` | 可复用 hook(useRealtime / useRole / useToast)。 |
| `types/contracts.ts` | **★ 共享契约**。前后端唯一真实源。改 schema 必须同步这里。 |
| `utils/rbac.ts` | **★ 角色矩阵**。纯 TS,前端 gate。后端 RLS 是 source of truth。 |
| `styles/global.css` | 设计 token + 组件样式。 |

### 后端 (`supabase/`)

| 目录 | 职责 |
|---|---|
| `migrations/` | SQL 迁移。**只追加不改旧**。0001=表 / 0002=RLS / 0003=triggers / 0004+... |
| `functions/` | Deno Edge Function。每个 `*/index.ts` = 一个独立函数,通过 `supabase functions invoke` 调。 |
| `seed.sql` | 演示数据。本地 dev 用,不进生产。 |
| `config.toml` | Supabase CLI 项目配置。 |

## 数据流

### 售前→立项(主要写路径)

```
presales 登录
    │
    ▼
OpportunitiesPage → 新建商机(写 opportunities)
    │
    ▼
OpportunityDetailPage → 上传 5 个交付物(写 artifacts + Storage)
    │
    ▼
点击"立项交接" → 写 projects + 触发通知(Realtime channel: project-handover)
    │
    ▼
PM 收到通知(Layout 顶栏红点) → ProjectsPage 看到新项目
```

### 协作(实时读路径)

```
PM 编辑里程碑
    │
    ▼
写 milestones → Postgres trigger → supabase_realtime publication
    │
    ▼
delivery 的浏览器订阅 channel:milestones:project_id=xxx
    │
    ▼
< 1s 收到 UPDATE 事件 → UI 刷新
```

### 售后 SLA(只读同步路径)

```
postsales 打开 TicketsPage
    │
    ▼
前端调 supabase.functions.invoke('ithub-sync')
    │
    ▼
Edge Function 读 env:ITHUB_MOCK
    ├── true  → 返回 mock 数据,upsert ithub_tickets
    └── false → GET ITHUB /api/ServiceDesk/Tickets/CheckPoint
                → 增量拉工单 → upsert ithub_tickets → 写 ithub_sync_log
    │
    ▼
前端渲染列表 + SLA 倒计时 + "在 ITHub 中打开" 链接
```

## 扩展点

见根目录 [`CLAUDE.md`](../CLAUDE.md) 的"扩展点"章节。