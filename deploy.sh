#!/bin/bash
set -e

cd /Users/doublep/WorkBuddy/2026-07-21-19-10-30

echo "🚀 开始部署..."

# 1. 检查是否有改动
if git diff --quiet && git diff --cached --quiet; then
    echo "📦 没有文件改动"
else
    echo "📦 提交代码..."
    git add -A
    git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
fi

# 2. 推送到 GitHub（Cloudflare Pages 自动构建）
echo "☁️ 推送到 GitHub，触发 Cloudflare Pages 自动构建..."
git push origin main

echo ""
echo "✅ 推送完成！"
echo "⏳ Cloudflare Pages 正在自动构建，约 1-2 分钟后生效"
echo "🌐 线上地址: https://siklog.work"
echo ""
echo "💡 构建进度可在 Cloudflare Dashboard 查看"
