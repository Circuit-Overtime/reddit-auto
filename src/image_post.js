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
 * Verify bot connection to Reddit
 */
async function verifyBotConnection(context) {
  console.log(`\n=== Verifying Bot Connection ===`);
  console.log(`Target subreddit: r/${TARGET_SUBREDDIT}`);
  
  const hasAccess = await checkSubredditAccess(context);
  
  if (!hasAccess) {
    console.error('❌ Bot does not have sufficient access to the target subreddit');
    console.log('Please ensure the bot has been added as a moderator or has posting permissions');
    return false;
  }
  
  console.log('✓ Bot connection verified successfully\n');
  return true;
}

/**
 * Post image to Reddit subreddit
 * Returns the post object if successful
 */
async function postImageToReddit(context, imageData, promptData) {
  try {
    console.log(`\n=== Posting to Reddit ===`);
    
    const subreddit = await context.reddit.getSubredditById(`t5_placeholder_${TARGET_SUBREDDIT}`);

    // Create post title
    const title = `🤖 Comic: ${promptData.prCount} PRs Merged Today`;

    // Create post body with PR highlights
    let body = `# Daily Pollinations Update Comic\n\n`;
    body += `**PRs Merged:** ${promptData.prCount}\n\n`;
    
    if (promptData.highlights && promptData.highlights.length > 0) {
      body += `## Highlights\n`;
      promptData.highlights.forEach(h => {
        body += `• ${h}\n`;
      });
      body += `\n`;
    }

    body += `**Generated with:** Pollinations AI\n`;
    body += `**Seed:** ${imageData.seed}\n`;
    body += `**Model:** ${imageData.metadata.model}\n`;

    console.log(`Posting: "${title}"`);
    console.log(`Body preview:\n${body.substring(0, 200)}...\n`);

    // Create the post with image
    const post = await subreddit.submitImage({
      title,
      imagePath: imageData.filepath,
      preview: body,
    });

    console.log(`✓ Successfully posted to r/${TARGET_SUBREDDIT}`);
    console.log(`Post URL: ${post.permalink}`);
    
    return post;
  } catch (error) {
    console.error('❌ Failed to post to Reddit:', error.message);
    throw error;
  }
}

/**
 * MAIN WORKFLOW: PR => IMAGE => POST
 * Complete pipeline: Fetch PRs → Generate Image → Post to Reddit
 * 
 * @param {string} githubToken - GitHub API token
 * @param {string} pollinationsToken - Pollinations API token (optional)
 * @param {object} context - Devvit context (required for posting)
 * @returns {object} Complete workflow result
 */
async function runFullWorkflow(githubToken, pollinationsToken, context) {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           FULL WORKFLOW: PR → IMAGE → POST                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // STEP 1: Fetch PRs and generate prompt
    console.log('📋 STEP 1: Fetching PRs from previous day...');
    const promptData = await getPRsAndCreatePrompt(githubToken, pollinationsToken);
    
    if (!promptData) {
      throw new Error('Failed to generate prompt from PRs');
    }
    console.log(`✓ Fetched ${promptData.prCount} PRs and generated prompt\n`);

    // STEP 2: Generate comic image
    console.log('🎨 STEP 2: Generating comic image...');
    const imageData = await generateAndSaveComicImage(promptData, pollinationsToken);
    
    if (!imageData.success) {
      throw new Error(`Image generation failed: ${imageData.error}`);
    }
    console.log(`✓ Image generated: ${imageData.filename}\n`);

    // STEP 3: Verify bot connection
    console.log('🤖 STEP 3: Verifying bot connection...');
    const botConnected = await verifyBotConnection(context);
    
    if (!botConnected) {
      throw new Error('Bot connection verification failed');
    }
    console.log(`✓ Bot connection verified\n`);

    // STEP 4: Post to Reddit
    console.log('📤 STEP 4: Posting to Reddit...');
    const post = await postImageToReddit(context, imageData, promptData);
    console.log(`✓ Posted successfully\n`);

    // Summary
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  WORKFLOW COMPLETE ✓                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    return {
      success: true,
      prCount: promptData.prCount,
      imageFile: imageData.filename,
      imageSize: imageData.fileSizeKb,
      postUrl: post.permalink,
      postId: post.id,
    };
  } catch (error) {
    console.error('\n❌ Workflow failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export { runFullWorkflow, verifyBotConnection, postImageToReddit, TARGET_SUBREDDIT };
