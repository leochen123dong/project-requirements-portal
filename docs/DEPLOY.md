# 部署

## 5 分钟首次部署

> 假设你已经有一个 GitHub 账号与一个 Supabase 账号。

### 1. Fork 仓库

```bash
# 在 GitHub 网页上 fork 本仓库到你的组织,然后 clone 到本地
git clone https://github.com/<your-org>/project-requirements-portal.git
cd project-requirements-portal
```

### 2. 创建 Supabase 项目

1. 打开 [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → 选组织 + 区域(推荐 `Singapore` / `Tokyo` 离中国近) → 记下数据库密码
3. 等 ~2 分钟项目初始化完成
4. 进入 **Settings → API** 拷贝:
   - **Project URL**(形如 `https://xxxxx.supabase.co`)
   - **anon public key**
   - **service_role key**(留作本地迁移用,**不要**给前端)

### 3. 配置 GitHub Secrets

在你的 fork 仓库 → **Settings → Secrets and variables → Actions → New repository secret**,添加:

| Secret 名 | 值 |
|---|---|
| `VITE_SUPABASE_URL` | 第 2 步的 Project URL |
| `VITE_SUPABASE_ANON_KEY` | 第 2 步的 anon key |

(可选)如果接 ITHub:

| Secret 名 | 值 |
|---|---|
| `ITHUB_API_BASE` | 你的 ITHub 实例 URL,如 `https://ithub.example.com` |
| `ITHUB_API_KEY` | ITHub API Key |
| `ITHUB_MOCK` | `false`(默认 `true` 走 mock) |

### 4. 跑数据库迁移

在 Supabase Dashboard → **SQL Editor → New query**,依次执行:

1. `supabase/migrations/0001_init.sql`(创建 10 张表)
2. `supabase/migrations/0002_rls.sql`(行级安全策略)
3. `supabase/migrations/0003_triggers.sql`(auth trigger + audit_log)
4. `supabase/seed.sql`(演示数据,**注意先创建 auth.users 再回头填 UUID**)

或者用 CLI(推荐):

```bash
# 本地一次性安装
brew install supabase/tap/supabase  # macOS
# 或 npm i -g supabase

supabase link --project-ref <your-project-ref>
supabase db push                      # 跑所有 migrations
psql -f supabase/seed.sql            # 跑 seed(可选)
```

### 5. 部署 Edge Functions

```bash
supabase functions deploy ithub-sync
supabase functions deploy ithub-push

supabase secrets set \
  ITHUB_API_BASE=https://ithub.example.com \
  ITHUB_API_KEY=your-api-key \
  ITHUB_MOCK=false
```

### 6. 推送 main,触发 GH Pages 部署

```bash
git push origin main
```

GitHub Actions 会自动跑:
1. `npm ci` → `npm run typecheck` → `npm run build`
2. 上传 `web/dist/` 到 Pages
3. 部署到 `https://<your-org>.github.io/project-requirements-portal/`

> **首次需要在仓库 Settings → Pages** 选 **Source: GitHub Actions**(不是 `Deploy from a branch`)。

### 7. 创建第一批用户

1. Supabase Dashboard → **Authentication → Users → Add user → Create new user**
2. 填邮箱 + 密码(或勾 "Send magic link")
3. 创建后在 **SQL Editor** 执行(把 `<USER_UUID>` 换成实际 UUID):

```sql
update public.profiles
set display_name = '王售前', role = 'presales'
where id = '<USER_UUID>';
```

4. 重复 4 次,创建 4 个角色账号(详见 [`ROLES.md`](ROLES.md))

### 8. 登录验证

打开 `https://<your-org>.github.io/project-requirements-portal/`,应该看到登录页 → 邮箱魔法链接登录 → 看到角色对应的菜单。

---

## 故障排查

### GH Pages 显示 404 / 白屏

**症状**:打开 URL 后页面是空白或 GitHub 的 404 页。

**排查**:
1. 打开浏览器 DevTools → Console,看是否有 `Failed to load resource` 错误
2. 检查 Network → JS/CSS 请求路径是否带 `/project-requirements-portal/` 前缀
3. 如果没有,确认 `VITE_BASE_PATH` 在 workflow 中被正确设置
4. 等待 GH Pages 部署完成(首次 ~2-3 分钟)

### 登录页"Supabase 未配置"提示

**症状**:点击登录后报错 "Supabase 未配置 (检查 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)"。

**排查**:
1. 确认 GitHub Secrets 中 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 已设置
2. 触发一次新的部署(push 一个空 commit 即可)
3. 检查 Actions 日志,确认 env 在 build 步骤被传入

### RLS 报错 "new row violates row-level security policy"

**症状**:写入数据时报 RLS 错误。

**排查**:
1. 确认登录用户有 `profiles.role` 设置(用 `select role from profiles where id = auth.uid()` 验证)
2. 确认 `supabase/migrations/0002_rls.sql` 的策略允许该角色写
3. 用 SQL Editor 跑 `set role authenticated; select * from opportunities;` 看返回什么

### ITHub 工单为空

**症状**:TicketsPage 显示"暂无工单"。

**排查**:
1. 确认 Edge Function 已部署:`supabase functions list`
2. 确认 secrets 已设置:`supabase secrets list`
3. 调一次同步:`supabase functions invoke ithub-sync`
4. 看返回的 `errors` 字段(网络问题 / 认证错误)
5. 临时设 `ITHUB_MOCK=true` 验证前端渲染逻辑

### 实时评论不更新

**症状**:A 发评论,B 看不到。

**排查**:
1. Supabase Dashboard → **Database → Replication**,确认 `comments` 表已加到 `supabase_realtime` publication
2. 浏览器 Console 看 `[Realtime] Subscribed` 日志
3. 浏览器 Network 看 WebSocket 连接是否建立
4. 确认 `migrations/0003_triggers.sql` 跑了(它会给新表加 `REPLICA IDENTITY FULL`)

---

## 升级

1. 拉取上游变更:`git fetch upstream && git merge upstream/main`
2. 如有新 migration:`supabase db push`
3. 如有新 Edge Function:`supabase functions deploy <name>`
4. 推 main:`git push origin main`

---

## 回滚

### 回滚前端

```bash
git revert <bad-commit-sha>
git push origin main
# GH Pages 会在 ~1 分钟内回滚
```

### 回滚数据库

```bash
# 列出所有迁移
supabase migration list

# 在 Supabase SQL Editor 手动写反向 SQL(Supabase 不支持自动 down migration)
```

### 回滚 Edge Function

```bash
supabase functions deploy ithub-sync --no-verify-jwt  # 临时关闭 JWT 校验
# 或在 Dashboard → Edge Functions → 选中 → Deploy previous version
```