/**
 * Test/Debug utility for individual modules
 * Run specific parts of the workflow in isolation
 */

import { getMergedPRsFromPreviousDay, createMergedPrompt } from './getPreviousDayPRs.js';
import { generateAndSaveComicImage, enhanceComicPrompt } from './generateComicImage.js';

/**
 * Test 1: Verify GitHub token and fetch PRs
 */
async function testFetchPRs() {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    console.error('❌ GITHUB_TOKEN not set');
    return;
  }

  console.log('\n=== TEST 1: Fetch Previous Day PRs ===\n');

  try {
    const prs = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
    console.log(`✓ Found ${prs.length} PRs`);

    if (prs.length > 0) {
      console.log('\nFirst 3 PRs:');
      prs.slice(0, 3).forEach(pr => {
        console.log(`  #${pr.number}: ${pr.title}`);
      });
    }

    return prs;
  } catch (error) {
    console.error('✗ Error:', error.message);
    return null;
  }
}

/**
 * Test 2: Create merged prompt from PRs
 */
async function testCreatePrompt() {
  console.log('\n=== TEST 2: Create Merged Prompt ===\n');

  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    console.error('❌ GITHUB_TOKEN not set');
    return;
  }

  try {
    const prs = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
    const promptData = createMergedPrompt(prs);

    console.log(`✓ Created prompt for ${promptData.prCount} PRs\n`);
    console.log('Summary:');
    console.log(promptData.summary);
    console.log('\nPrompt (first 300 chars):');
    console.log(promptData.prompt.substring(0, 300) + '...');

    return promptData;
  } catch (error) {
    console.error('✗ Error:', error.message);
    return null;
  }
}

/**
 * Test 3: Test comic prompt enhancement
 */
function testPromptEnhancement() {
  console.log('\n=== TEST 3: Comic Prompt Enhancement ===\n');

  const basePrompt = 'A robot building something';
  const enhancedPrompt = enhanceComicPrompt(basePrompt);

  console.log('Base prompt:');
  console.log(basePrompt);
  console.log('\nEnhanced comic prompt:');
  console.log(enhancedPrompt);

  return enhancedPrompt;
}

/**
 * Test 4: Generate and save image (requires Pollinations API)
 */
async function testGenerateImage() {
  console.log('\n=== TEST 4: Generate and Save Image ===\n');

  const testPrompt = {
    prompt: 'A colorful comic book style illustration of bees and flowers collaborating on code, bright vibrant colors, dynamic action, comic-style design',
    summary: 'Test image generation',
    prCount: 5,
    highlights: ['feature: new API', 'bug fix: memory leak'],
    prs: [],
  };

  console.log('Generating test image...');
  console.log(`Prompt: ${testPrompt.prompt.substring(0, 100)}...\n`);

  try {
    const result = await generateAndSaveComicImage(testPrompt);

    if (result.success) {
      console.log(`✓ Image generated successfully`);
      console.log(`  File: ${result.filename}`);
      console.log(`  Size: ${result.fileSizeKb} KB`);
      console.log(`  Path: ${result.filepath}`);
      return result;
    } else {
      console.error(`✗ Image generation failed: ${result.error}`);
      return null;
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
    return null;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Module Testing Suite                                      ║');
  console.log('║  Test individual components of the comic bot               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = {
    testFetchPRs: null,
    testCreatePrompt: null,
    testPromptEnhancement: null,
    testGenerateImage: null,
  };

  // Test 1: Fetch PRs
  results.testFetchPRs = await testFetchPRs();

  // Test 2: Create prompt
  results.testCreatePrompt = await testCreatePrompt();

  // Test 3: Enhance prompt
  results.testPromptEnhancement = testPromptEnhancement();

  // Test 4: Generate image (optional - requires API)
  console.log('\n⚠️  Skipping image generation test (would use API credits)');
  console.log('   Use testGenerateImage() directly to test image generation\n');

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`✓ PR Fetching: ${results.testFetchPRs ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Prompt Creation: ${results.testCreatePrompt ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Prompt Enhancement: ${results.testPromptEnhancement ? 'PASS' : 'FAIL'}`);
  console.log(`⏭️  Image Generation: SKIPPED (run testGenerateImage() to test)`);

  console.log('\n📝 Individual Tests:\n');
  console.log('  1. Test PR fetching:');
  console.log('     await testFetchPRs();\n');
  console.log('  2. Test prompt creation:');
  console.log('     await testCreatePrompt();\n');
  console.log('  3. Test prompt enhancement:');
  console.log('     testPromptEnhancement();\n');
  console.log('  4. Test image generation:');
  console.log('     await testGenerateImage();\n');
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  import { fileURLToPath } from 'url';
  runAllTests().catch(console.error);
}

export { testFetchPRs, testCreatePrompt, testPromptEnhancement, testGenerateImage, runAllTests };
