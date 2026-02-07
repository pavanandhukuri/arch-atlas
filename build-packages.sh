#!/bin/bash
set -e

echo "🏗️  Building Arch Atlas packages..."

# Build in dependency order
echo "📦 Building @arch-atlas/core-model..."
cd packages/core-model && pnpm build && cd ../..

echo "📦 Building @arch-atlas/model-schema..."
cd packages/model-schema && pnpm build && cd ../..

echo "📦 Building @arch-atlas/layout..."
cd packages/layout && pnpm build && cd ../..

echo "📦 Building @arch-atlas/renderer..."
cd packages/renderer && pnpm build && cd ../..

echo "✅ All packages built successfully!"
echo ""
echo "🚀 You can now start the Studio:"
echo "   cd apps/studio && pnpm dev"
