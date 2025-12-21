import { Devvit } from '@devvit/public-api';
import { getPRsAndCreatePrompt } from './getPreviousDayPRs.js';
import { generateAndSaveComicImage } from './generateComicImage.js';

const TARGET_SUBREDDIT = 'pollinations_ai';

/**
 * Check if the bot has required permissions in the target subreddit
 */
async function checkSubredditAccess(context) {
  try {
    const subreddit = await context.reddit.getSubredditById(`t5_placeholder_${TARGET_SUBREDDIT}`);
    console.log(`✓ Successfully accessed r/${TARGET_SUBREDDIT}`);
    
    // Try to check moderation permissions
    const currentUser = await context.reddit.getCurrentUser();
    console.log(`✓ Running as user: ${currentUser.username}`);
    
    // Verify we can read from the subreddit
    const topPosts = await subreddit.getTopPostsFromPage({
      pageSize: 1,
      page: 0,
    });
    
    console.log(`✓ Can read posts from r/${TARGET_SUBREDDIT}`);
    return true;
  } catch (err) {
    console.error(`✗ Access denied to r/${TARGET_SUBREDDIT}:`, err);
    return false;
  }
}

/**
 * Initialize and verify bot access
 */
async function initializeBotAccess(context) {
  console.log(`\n=== Checking Bot Access ===`);
  console.log(`Target subreddit: r/${TARGET_SUBREDDIT}`);
  
  const hasAccess = await checkSubredditAccess(context);
  
  if (!hasAccess) {
    console.error('❌ Bot does not have sufficient access to the target subreddit');
    console.log('Please ensure the bot has been added as a moderator or has posting permissions');
    return false;
  }
  
  console.log('✓ Bot access verified successfully\n');
  return true;
}

/**
 * Main entrypoint orchestrating the complete workflow:
 * 1. Fetch PRs from previous day
 * 2. Generate combined prompt
 * 3. Generate comic image
 * 4. Verify bot connection (no posting)
 */
async function runComicGenerationWorkflow(githubToken, pollinationsToken, context = null) {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          COMIC GENERATION WORKFLOW - FULL PIPELINE          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Step 1: Fetch PRs and create merged prompt
    console.log('📋 STEP 1: Fetching PRs from previous day...');
    const promptData = await getPRsAndCreatePrompt(githubToken, pollinationsToken);
    
    if (!promptData) {
      throw new Error('Failed to generate prompt from PRs');
    }

    console.log(`✓ Generated prompt with ${promptData.prCount} PRs\n`);

    // Step 2: Generate comic image using the prompt
    console.log('🎨 STEP 2: Generating comic image with merged prompt...');
    const imageData = await generateAndSaveComicImage(promptData, pollinationsToken);
    
    if (!imageData.success) {
      throw new Error(`Image generation failed: ${imageData.error}`);
    }

    console.log(`✓ Image generated successfully: ${imageData.filename}\n`);

    // Step 3: Verify bot connection (if context provided)
    let botStatus = { connected: false, message: 'No context provided' };
    if (context) {
      console.log('🤖 STEP 3: Verifying bot connection...');
      botStatus.connected = await initializeBotAccess(context);
      botStatus.message = botStatus.connected 
        ? 'Bot is ready for operations' 
        : 'Bot access verification failed';
      console.log(`✓ Bot verification complete\n`);
    } else {
      console.log('⚠️  STEP 3: Bot connection verification skipped (no context)\n');
    }

    // Summary
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    WORKFLOW COMPLETE                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    return {
      success: true,
      steps: {
        prFetch: {
          success: true,
          prCount: promptData.prCount,
          highlights: promptData.highlights,
        },
        imageGeneration: {
          success: imageData.success,
          filename: imageData.filename,
          filepath: imageData.filepath,
          filesize: imageData.fileSizeKb,
        },
        botVerification: {
          success: botStatus.connected,
          message: botStatus.message,
        },
      },
      imageData,
      promptData,
    };
  } catch (error) {
    console.error('\n❌ Workflow failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Standalone entry point for testing (without Devvit context)
 * Usage: node image_post.js <github_token> [pollinations_token]
 */
async function standaloneEntrypoint() {
  const githubToken = process.argv[2];
  const pollinationsToken = process.argv[3];

  if (!githubToken) {
    console.error('Usage: node image_post.js <github_token> [pollinations_token]');
    process.exit(1);
  }

  const result = await runComicGenerationWorkflow(githubToken, pollinationsToken);
  
  if (!result.success) {
    process.exit(1);
  }
}

// Run standalone if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  standaloneEntrypoint().catch(console.error);
}

export { runComicGenerationWorkflow, initializeBotAccess, TARGET_SUBREDDIT };
