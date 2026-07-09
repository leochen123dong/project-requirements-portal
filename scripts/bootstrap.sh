#!/usr/bin/env bash
# bootstrap.sh — 一键引导脚本,打印所有需要的命令(不执行写操作)
#
# 使用方法:
#   ./scripts/bootstrap.sh                # 打印所有步骤
#   ./scripts/bootstrap.sh --auto         # 尝试执行 git init + 装依赖(可选)

set -euo pipefail

GITHUB_ORG="${GITHUB_ORG:-<your-org>}"
REPO_NAME="${REPO_NAME:-project-requirements-portal}"

cat <<EOF
═══════════════════════════════════════════════════════════════
  项目需求管理门户 · 引导
═══════════════════════════════════════════════════════════════

下一步操作(按顺序执行):

───────────────────────────────────────────────────────────────
[1/6] 初始化本地仓库(如果还没 git init)
───────────────────────────────────────────────────────────────

  cd $(pwd)
  git init
  git add -A
  git commit -m "[phase-0] scaffold repo + design tokens"

───────────────────────────────────────────────────────────────
[2/6] 创建 GitHub 仓库
───────────────────────────────────────────────────────────────

  # 选项 A:用 gh CLI(需先 gh auth login)
  gh repo create ${GITHUB_ORG}/${REPO_NAME} --public --source=. --remote=origin --push

  # 选项 B:手动在 GitHub 网页创建,然后:
  git remote add origin git@github.com:${GITHUB_ORG}/${REPO_NAME}.git
  git branch -M main
  git push -u origin main

───────────────────────────────────────────────────────────────
[3/6] 创建 Supabase 项目
───────────────────────────────────────────────────────────────

  1. 打开 https://supabase.com/dashboard
  2. New project → 选组织 / 区域(Singapore 推荐) → 记下密码
  3. 等初始化完成(~2 分钟)
  4. Settings → API → 拷贝 Project URL + anon key + service_role key

───────────────────────────────────────────────────────────────
[4/6] 配置 GitHub Secrets
───────────────────────────────────────────────────────────────

  在仓库 Settings → Secrets and variables → Actions:

  VITE_SUPABASE_URL       = <Project URL>
  VITE_SUPABASE_ANON_KEY  = <anon key>

  (可选)ITHUB_API_BASE, ITHUB_API_KEY, ITHUB_MOCK=false

───────────────────────────────────────────────────────────────
[5/6] 跑数据库迁移
───────────────────────────────────────────────────────────────

  # 选项 A:Supabase CLI(推荐)
  brew install supabase/tap/supabase   # macOS
  supabase link --project-ref <your-project-ref>
  supabase db push                     # 跑所有 migrations
  psql -f supabase/seed.sql            # 可选:demo 数据

  # 选项 B:手动(在 Supabase SQL Editor 依次执行)
  0001_init.sql → 0002_rls.sql → 0003_triggers.sql → seed.sql

───────────────────────────────────────────────────────────────
[6/6] 部署 Edge Functions(可选)
───────────────────────────────────────────────────────────────

  supabase functions deploy ithub-sync
  supabase functions deploy ithub-push
  supabase secrets set ITHUB_API_BASE=... ITHUB_API_KEY=...

───────────────────────────────────────────────────────────────
  ✓ 推 main → GitHub Actions 自动部署 → ${GITHUB_ORG}.github.io/${REPO_NAME}/
───────────────────────────────────────────────────────────────

EOF

# --auto 模式:git init + npm install
if [[ "${1:-}" == "--auto" ]]; then
  echo "[auto] git init..."
  if [[ ! -d .git ]]; then
    git init
  fi
  echo "[auto] npm install in web/..."
  (cd web && npm install)
  echo "[auto] 完成。下一步:创建 GitHub repo + 配 Supabase。"
fi