#!/bin/bash
echo "========== 🔍 批量导入问题诊断报告 =========="
echo ""

cd /Users/doublep/WorkBuddy/2026-07-21-19-10-30

# 1. 检查本地 .env 文件
echo "【1/5】检查本地 .env 文件..."
if [ -f ".env" ]; then
    if grep -q "VITE_YOUTUBE_API_KEY" .env; then
        echo "  ✅ 本地 .env 有 VITE_YOUTUBE_API_KEY"
        grep "VITE_YOUTUBE_API_KEY" .env | sed 's/.*/  内容: ***/'
    else
        echo "  ❌ 本地 .env 缺少 VITE_YOUTUBE_API_KEY"
    fi
else
    echo "  ❌ 没有 .env 文件"
fi
echo ""

# 2. 检查 wrangler.jsonc 是否有 Pages 环境变量配置
echo "【2/5】检查 wrangler.jsonc..."
if grep -q "VITE_YOUTUBE_API_KEY" wrangler.jsonc 2>/dev/null; then
    echo "  ✅ wrangler.jsonc 有环境变量配置"
else
    echo "  ❌ wrangler.jsonc 没有 VITE_YOUTUBE_API_KEY 配置"
    echo "  提示: 线上构建时不会自动注入 .env 里的变量"
fi
echo ""

# 3. 检查 videoFetcher.ts 里的 API Key 读取逻辑
echo "【3/5】检查 videoFetcher.ts 的 API Key 读取..."
if grep -q "VITE_YOUTUBE_API_KEY" src/lib/videoFetcher.ts; then
    echo "  ✅ 前端代码读取 VITE_YOUTUBE_API_KEY"
else
    echo "  ❌ 前端代码没有读取 VITE_YOUTUBE_API_KEY"
fi
echo ""

# 4. 检查 Worker 文件是否存在
echo "【4/5】检查 Worker 文件..."
if [ -f "functions/api/youtube-meta.ts" ]; then
    echo "  ✅ Worker 文件存在"
    # 检查是否有 YOUTUBE_API_KEY 环境变量读取
    if grep -q "YOUTUBE_API_KEY" functions/api/youtube-meta.ts; then
        echo "  ✅ Worker 代码有 YOUTUBE_API_KEY 相关逻辑"
    else
        echo "  ⚠️  Worker 代码没有 YOUTUBE_API_KEY 环境变量读取"
    fi
    # 检查是否有硬编码的 innertube key
    if grep -q "AIzaSy" functions/api/youtube-meta.ts; then
        echo "  ⚠️  Worker 里有硬编码的 YouTube API Key（可能已失效）"
    fi
else
    echo "  ❌ Worker 文件不存在"
fi
echo ""

# 5. 检查 ShowFormModal.tsx 修改是否正确
echo "【5/5】检查批量导入代码..."
if grep -q "fetchVideoInfo(url)" src/components/ShowFormModal.tsx; then
    echo "  ✅ 批量导入已改为调用 fetchVideoInfo"
else
    echo "  ❌ 批量导入仍使用旧 API 路径"
fi
echo ""

echo "========== 📋 诊断总结 =========="
echo ""
echo "问题分析:"
echo "  1. 本地正常 → 因为 .env 里有 VITE_YOUTUBE_API_KEY，前端直接调 YouTube API"
echo "  2. 线上不行 → 因为 Cloudflare Pages 构建时没有 VITE_YOUTUBE_API_KEY"
echo "     前端 fallback 到 Worker → Worker 返回空数据"
echo ""
echo "需要修复:"
echo "  A. 在 Cloudflare Pages 控制台添加 VITE_YOUTUBE_API_KEY 环境变量"
echo "  B. 修复 Worker 代码，让它能正确获取视频数据（作为兜底）"
echo ""
