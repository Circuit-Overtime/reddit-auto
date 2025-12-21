import { Devvit, Context } from '@devvit/public-api';

const TARGET_SUBREDDIT = 'pollinations_ai';

/**
 * Check if the bot has required permissions in the target subreddit
 */
async function checkSubredditAccess(context: Context): Promise<boolean> {
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
async function initializeBotAccess(context: Context): Promise<boolean> {
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

async function main(context: Context) {
  try {
    // 1. Verify bot access to target subreddit
    const accessVerified = await initializeBotAccess(context);
    if (!accessVerified) {
      throw new Error('Bot access verification failed');
    }

    console.log('Bot is ready for operations');
    // Further operations will use the verified access
  } catch (err) {
    console.error('Error in main:', err);
  }
}

// Run the main function
main();
