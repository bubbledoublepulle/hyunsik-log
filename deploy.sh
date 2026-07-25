#!/bin/bash
set -e

PROJECT_DIR="/Users/doublep/WorkBuddy/2026-07-21-19-10-30"
cd "$PROJECT_DIR"

echo "🚀 开始部署..."

# 1. 提交代码备份（如果有改动）
echo "📦 备份代码..."
git add -A
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || echo "  无需提交"

# 2. 构建
echo "🔨 构建项目..."
npm run build

# 3. 部署到 Cloudflare Pages
echo "☁️  部署到 Cloudflare Pages..."
npx wrangler pages deploy dist

echo "✅ 部署完成！"
echo "🌐 线上地址: https://siklog.work"
