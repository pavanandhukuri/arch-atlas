#!/bin/bash
set -e

echo "🏗️  Building Arch Atlas packages..."

# Build in dependency order
echo "📦 Building @archatlas/core-model..."
cd packages/core-model && pnpm build && cd ../..

echo "📦 Building @archatlas/model-schema..."
cd packages/model-schema && pnpm build && cd ../..

echo "📦 Building @archatlas/layout..."
cd packages/layout && pnpm build && cd ../..

echo "📦 Building @archatlas/renderer..."
cd packages/renderer && pnpm build && cd ../..

echo "✅ All packages built successfully!"
echo ""
echo "🚀 You can now start the Studio:"
echo "   cd apps/studio && pnpm dev"
