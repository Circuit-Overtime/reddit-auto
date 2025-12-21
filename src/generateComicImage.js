/**
 * Module to generate comic-styled images and save them locally
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POLLINATIONS_IMAGE_API = 'https://gen.pollinations.ai/image';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2;

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
 * Generate image from prompt using Pollinations API with retries
 */
async function generateImage(prompt, pollinationsToken, attempt = 0) {
  if (attempt > 0) {
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
    console.log(`  Retrying in ${delay}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await new Promise(r => setTimeout(r, delay * 1000));
  }

  try {
    
    const params = new URLSearchParams({
      model: 'zimage',
      width: 1024,
      height: 1024,
    });

    const response = await fetch(`${POLLINATIONS_IMAGE_API}/${encodeURIComponent(prompt)}?model=${params.get('model')}&width=${params.get('width')}&height=${params.get('height')}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.POLLINATIONS_TOKEN}`,
      },
      timeout: 120000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {
      console.log(`  ✗ Attempt ${attempt + 1} failed: ${error.message}`);
      return generateImage(prompt, pollinationsToken, attempt + 1);
    }
    throw error;
  }
}

/**
 * Generate and save comic image from prompt data
 */
async function generateAndSaveComicImage(promptData, pollinationsToken = null) {
  try {
    console.log('\n=== Generating Comic Image ===\n');

    const outputDir = ensureOutputDirectory();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `comic-${timestamp}-${Date.now()}.png`;
    const filepath = path.join(outputDir, filename);

    console.log(`Prompt: ${promptData.prompt.substring(0, 100)}...\n`);
    console.log(`Generating image...`);

    // Generate image
    const imageBuffer = await generateImage(promptData.prompt, pollinationsToken);

    // Save to disk
    fs.writeFileSync(filepath, imageBuffer);
    const fileSizeKb = (imageBuffer.length / 1024).toFixed(2);

    console.log(`\n✓ Image saved successfully`);
    console.log(`  Filename: ${filename}`);
    console.log(`  Size: ${fileSizeKb} KB\n`);

    return {
      success: true,
      filepath,
      filename,
      filesize: imageBuffer.length,
      fileSizeKb,
      timestamp,
      prompt: promptData.prompt,
      metadata: {
        prCount: promptData.prCount,
        prReferences: promptData.prs || [],
      },
    };
  } catch (error) {
    console.error('Error generating image:', error.message);
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
      prompt: imageData.prompt,
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
 * Test image generation
 */
async function testGenerateImage() {
  const testPrompt = {
    prompt: 'Single wide comic-book splash panel, nature-first Pollinations world: a central thriving garden-forest greenhouse hybrid bursting with life, bold comic inks, organic linework, natural palette (forest greens, soil browns, sky blues, sunset oranges, floral purples), dynamic motion with wind ribbons, drifting pollen clouds, light rain sparkle, flowing rivulets, cooperative bees and small birds actively pollinating; FOUR clearly separated, distinct natural elements (one per update) arranged as readable vignettes around the center while still part of one ecosystem: (1) an “Instagram post” represented as a tall sunflower-like bloom with a naturally framed petal “window” (leaf-made border) attracting butterflies as if it’s being displayed to the meadow—seeds carried outward on the breeze to neighboring plants; (2) a bug-fix vignette: gardeners and ladybugs pruning diseased twigs and uprooting invasive weeds, revealing a clean lattice of healthy roots where tangled duplicates were removed—one main root trunk feeding multiple shoots through tidy branching, with a few pests being swept away; (3) documentation generation vignette: a young tree unfurling oversized leaves like scrolls, etched with orderly botanical patterns and tidy lines, spores of “wisdom” drifting to nearby sprouts as bees trace the patterns; (4) creative tool addition vignette: a rare new flowering plant resembling an “image grove” blossom—petals shaped like soft brushstrokes and natural pigment stains—sprouting beside an artist bower where hummingbirds and bees mix pollen like paint, creating new colorful blooms that spread into the garden; emphasize clear separation between the four elements with natural pathways and stones, visible before/after transformation energy, celebratory cooperative ecosystem blending outward, no neon, no tech UI, no text, epic vibrant splash composition.',
    summary: 'Test image generation',
    prCount: 1,
    highlights: ['test: image generation'],
    prs: [],
  };

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              TEST IMAGE GENERATION                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const result = await generateAndSaveComicImage(testPrompt);

  if (result.success) {
    console.log('╔════════════════════════════════════════════════════════════╗');
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

// export { generateAndSaveComicImage, saveGenerationMetadata, testGenerateImage };
