#!/bin/bash

SUBREDDIT="pollinations_ai"
APP_NAME="polli-ai"

echo "🚀 Starting Pollinations deployment pipeline..."
echo "📝 Step 1: Generating image prompt and updating link.ts..."
npx tsx src/pipeline.ts

if [ $? -ne 0 ]; then
  echo "❌ Pipeline failed"
  exit 1
fi

echo "✓ Pipeline completed, waiting 5 seconds for link.ts to update..."
sleep 5

echo "📤 Step 2: Updating the app..."
npx devvit upload
if [ $? -ne 0 ]; then
  echo "❌ Update failed"
  exit 1
fi
echo "✓ App updated successfully"
sleep 2
echo "📊 Step 3: Watching console logs for image upload..."
echo "The AppUpgrade trigger will fire and post the image to r/$SUBREDDIT"
echo ""

npx devvit logs "$SUBREDDIT"