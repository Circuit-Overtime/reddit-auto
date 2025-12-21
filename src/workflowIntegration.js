/**
 * Integration script - demonstrates the full workflow:
 * 1. Check Reddit bot access
 * 2. Fetch previous day's PRs and create merged prompt
 * 3. Generate comic-styled image and save locally
 */

import { generateComicFromPRs } from './generateComicImage.js';
import { getPRsAndCreatePrompt } from './getPreviousDayPRs.js';

/**
 * Main workflow
 */
async function runFullWorkflow() {
  try {
    // Get environment variables
    const githubToken = process.env.GITHUB_TOKEN;
    const pollinationsToken = process.env.POLLINATIONS_TOKEN;

    if (!githubToken) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Pollinations Comic Generator - Full Workflow              ║');
    console.log('║  (No Reddit posting - local generation only)              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Step 1: Fetch PRs and create prompt
    console.log('\n[STEP 1] Fetching previous day\'s PRs...');
    const promptData = await getPRsAndCreatePrompt(githubToken);

    // Step 2: Generate and save comic image
    console.log('\n[STEP 2] Generating comic-styled image...');
    const result = await generateComicFromPRs(githubToken);

    if (result.imageData.success) {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║  ✓ Workflow Complete - Image Ready                        ║');
      console.log('╚════════════════════════════════════════════════════════════╝');

      console.log('\n📊 Summary:');
      console.log(`  PRs Processed: ${result.promptData.prCount}`);
      console.log(`  Image: ${result.imageData.filename}`);
      console.log(`  Size: ${result.imageData.fileSizeKb} KB`);
      console.log(`  Location: ${result.imageData.filepath}`);

      console.log('\n🔗 Next Steps:');
      console.log('  1. Review the generated image in the generated_images folder');
      console.log('  2. Once approved, use createRedditPost.js to post to Reddit');
      console.log('  3. Image is ready for use in your comment bot or post scheduler\n');
    } else {
      console.error('\n✗ Comic generation failed:', result.imageData.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Workflow error:', error.message);
    console.log('\nEnvironment Variables Needed:');
    console.log('  • GITHUB_TOKEN - GitHub personal access token (repo read access)');
    console.log('  • POLLINATIONS_TOKEN - Pollinations API key (optional, for authenticated requests)');
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFullWorkflow();
}

export { runFullWorkflow };
