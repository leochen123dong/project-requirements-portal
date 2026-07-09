# 角色矩阵

> 业务侧的 5 个角色 + 各自的默认菜单 + 权限边界。

## 角色一览

| 角色 | 业务含义 | 主要场景 |
|---|---|---|
| **presales**(售前) | 销售工程师 | 录入商机、走立项 7 阶段、上传 5 个交付物、触发交接给 PM |
| **pm**(项目经理) | 项目经理 | 接管立项项目、编辑里程碑、派任务、跟进售后 SLA |
| **delivery**(交付工程师) | 实施 / 网络 / 服务器工程师 | 完成任务、上传交付物、汇报进度 |
| **postsales**(售后) | 运维 / 客服 | 跟踪 ITHub 工单、SLA 计时、跳转 ITHub 处理 |
| **admin**(管理员) | 系统管理员 | 看全局仪表盘、用户管理、触发 ITHub 同步 |

## 默认菜单

```
顶部导航 (topnav-dark):

presales:   首页 · 商机
pm:         首页 · 商机 · 项目 · 工单
delivery:   首页 · 项目
postsales:  首页 · 项目 · 工单
admin:      首页 · 商机 · 项目 · 工单 · 仪表盘
```

权限代码见 [`web/src/utils/rbac.ts`](../web/src/utils/rbac.ts)。

## 操作权限矩阵

| 操作 | presales | pm | delivery | postsales | admin |
|---|:-:|:-:|:-:|:-:|:-:|
| 创建商机 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 编辑商机 | ✅(自己的) | ❌ | ❌ | ❌ | ✅ |
| 立项交接 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 编辑项目主线 | ❌ | ✅ | ❌ | ❌ | ✅ |
| 查看项目 | ✅(相关的) | ✅ | ✅ | ✅(相关的) | ✅ |
| 编辑里程碑 | ❌ | ✅ | ❌ | ❌ | ✅ |
| 派任务 | ❌ | ✅ | ✅ | ❌ | ✅ |
| 完成任务 | ❌ | ✅ | ✅ | ❌ | ✅ |
| 上传交付物 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 评论 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 查看工单 | ❌ | ✅(相关) | ❌ | ✅ | ✅ |
| 手动同步 ITHub | ❌ | ❌ | ❌ | ✅ | ✅ |
| 查看仪表盘 | ❌ | ❌ | ❌ | ❌ | ✅ |

> "相关" = 通过 `project_members` 中间表(本期简化为按 `projects.pm_id` / `projects.owner_id` 判断)。

## 默认 Demo 账号

| 角色 | 邮箱(示例) | 密码 / 魔法链接 |
|---|---|---|
| presales | `presales@demo.local` | 魔法链接 |
| pm | `pm@demo.local` | 魔法链接 |
| delivery | `delivery@demo.local` | 魔法链接 |
| postsales | `postsales@demo.local` | 魔法链接 |
| admin | `admin@demo.local` | 魔法链接 |

> 真实部署时这些账号在 Supabase Dashboard → Authentication → Users 中手动创建,UUID 写入 `profiles.role`。

## 修改权限

权限矩阵分散在两个地方,**必须同步修改**:

1. **前端 gate**:`web/src/utils/rbac.ts`(纯 TS,只控制 UI 显示与按钮可用性)
2. **后端 RLS**:`supabase/migrations/0002_rls.sql`(SQL,控制数据库读写,这是 source of truth)

修改步骤:
1. 改 `web/src/types/contracts.ts` 的 `RoleEnum`(如果加新角色)
2. 改 `web/src/utils/rbac.ts` 的 `PAGE_PERMISSIONS` 与 helper 函数
3. 改 `supabase/migrations/0002_rls.sql` 的策略(用新文件 `000N_rls_<feature>.sql` 追加,不要改旧文件)
4. 同步本文件的"操作权限矩阵"表格
5. 跑 `npm run typecheck` + 部署新 migration
6. Phase 3 测试覆盖:`e2e/rbac.spec.ts` 加越权测试