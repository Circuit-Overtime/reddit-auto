/**
 * Module to generate comic-styled images and save them locally
 * Does NOT post to Reddit - only generates and saves
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POLLINATIONS_IMAGE_BASE = 'https://image.pollinations.ai/prompt';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2;
const MAX_SEED = 2147483647;

// Image generation config
const IMAGE_CONFIG = {
  width: 1024,
  height: 1024,
  quality: 'hd',
  model: 'nanobanana', // Comic-friendly model
  style: 'comic', // Style parameter
};

/**
 * Ensure output directory exists
 */
function ensureOutputDirectory() {
  const outputDir = path.join(__dirname, '..', 'generated_images');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✓ Created output directory: ${outputDir}`);
  }
  
  return outputDir;
}

/**
 * Generate a comic-styled image prompt from a base prompt
 */
function enhanceComicPrompt(basePrompt) {
  const comicEnhancements = `
Comic book art style: dynamic composition, bold outlines, bright vibrant colors, action-packed.
Include: bright color palette, dynamic action, comic-style speech bubbles, dramatic lighting.
Art style: comic book illustration, 80s-90s comic aesthetic with modern digital quality.
  `.trim();

  return `${basePrompt}\n\n${comicEnhancements}`;
}

/**
 * Fetch image from Pollinations API with retries
 */
async function fetchImageWithRetry(encodedPrompt, seed, attempt = 0) {
  const url = `${POLLINATIONS_IMAGE_BASE}/${encodedPrompt}?model=${IMAGE_CONFIG.model}&width=${IMAGE_CONFIG.width}&height=${IMAGE_CONFIG.height}&quality=${IMAGE_CONFIG.quality}&seed=${seed}`;

  if (attempt > 0) {
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
    console.log(`  Retrying in ${delay}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, delay * 1000));
  }

  try {
    const response = await fetch(url, {
      timeout: 120000, // 2 minute timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    return buffer;
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {
      console.log(`  ✗ Attempt ${attempt + 1} failed: ${error.message}`);
      return fetchImageWithRetry(encodedPrompt, seed, attempt + 1);
    }
    throw error;
  }
}

/**
 * Generate comic-styled image and save locally
 */
async function generateAndSaveComicImage(promptData, pollinationsToken = null) {
  try {
    console.log('\n=== Generating Comic Image ===');

    // Enhance prompt with comic styling
    const comicPrompt = enhanceComicPrompt(promptData.prompt);
    console.log(`Prompt (${comicPrompt.length} chars):`);
    console.log(`---BEGIN PROMPT---`);
    console.log(comicPrompt);
    console.log(`---END PROMPT---\n`);

    // Ensure output directory exists
    const outputDir = ensureOutputDirectory();

    // Generate unique filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `comic-${timestamp}-${Date.now()}.png`;
    const filepath = path.join(outputDir, filename);

    console.log(`Generating image...`);
    console.log(`Model: ${IMAGE_CONFIG.model}`);
    console.log(`Size: ${IMAGE_CONFIG.width}x${IMAGE_CONFIG.height}`);
    console.log(`Quality: ${IMAGE_CONFIG.quality}`);

    // Generate random seed for reproducibility tracking
    const seed = Math.floor(Math.random() * MAX_SEED);
    console.log(`Seed: ${seed}`);

    // Encode prompt for URL
    const encodedPrompt = encodeURIComponent(comicPrompt);

    // Fetch image with retry logic
    let imageBuffer;
    try {
      imageBuffer = await fetchImageWithRetry(encodedPrompt, seed);
    } catch (error) {
      console.error(`✗ Failed to generate image after ${MAX_RETRIES} attempts: ${error.message}`);
      throw new Error(`Image generation failed: ${error.message}`);
    }

    // Save image to disk
    fs.writeFileSync(filepath, imageBuffer);
    const fileSizeKb = (imageBuffer.length / 1024).toFixed(2);

    console.log(`\n✓ Image saved successfully`);
    console.log(`  Path: ${filepath}`);
    console.log(`  Size: ${fileSizeKb} KB`);
    console.log(`  Filename: ${filename}`);

    return {
      success: true,
      filepath,
      filename,
      filesize: imageBuffer.length,
      fileSizeKb,
      seed,
      prompt: comicPrompt,
      timestamp,
      metadata: {
        model: IMAGE_CONFIG.model,
        width: IMAGE_CONFIG.width,
        height: IMAGE_CONFIG.height,
        quality: IMAGE_CONFIG.quality,
        prCount: promptData.prCount,
        prReferences: promptData.prs || [],
      },
    };
  } catch (error) {
    console.error('Error generating comic image:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Save generation metadata to JSON
 */
function saveGenerationMetadata(imageData, promptData) {
  try {
    const outputDir = ensureOutputDirectory();
    const metadataFilename = `${imageData.timestamp}-metadata.json`;
    const metadataPath = path.join(outputDir, metadataFilename);

    const metadata = {
      generatedAt: new Date().toISOString(),
      imageFilename: imageData.filename,
      imagePath: imageData.filepath,
      filesize: imageData.filesize,
      seed: imageData.seed,
      prompt: imageData.prompt,
      config: imageData.metadata,
      prSummary: promptData.summary,
      prHighlights: promptData.highlights,
      prReferences: promptData.prs,
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`✓ Metadata saved: ${metadataPath}\n`);

    return metadataPath;
  } catch (error) {
    console.error('Error saving metadata:', error);
    return null;
  }
}

/**
 * Test image generation with a test prompt
 * Usage: node generateComicImage.js
 */
async function testGenerateImage() {
  const testPrompt = {
    prompt: 'A vibrant comic book style illustration of bees pollinating code flowers in a digital garden, bright vibrant colors, dynamic action, bold outlines, comic aesthetic',
    summary: 'Test image generation - no PRs',
    prCount: 0,
    highlights: ['test: image generation'],
    prs: [],
  };

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              TEST IMAGE GENERATION                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const result = await generateAndSaveComicImage(testPrompt);

  if (result.success) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  TEST PASSED ✓                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`File: ${result.filename}`);
    console.log(`Path: ${result.filepath}`);
    console.log(`Size: ${result.fileSizeKb} KB\n`);
  } else {
    console.log('\n❌ Test failed:', result.error);
    process.exit(1);
  }
}




testGenerateImage().catch(console.error);
// export { generateAndSaveComicImage, saveGenerationMetadata, enhanceComicPrompt, testGenerateImage };
