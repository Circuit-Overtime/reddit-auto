import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {getPRsAndCreatePrompt} from './getPreviousDayPRs.js';
import { isRPLColor } from '@devvit/public-api/devvit/internals/helpers/color.js';

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
      model: 'nanobanana',
      width: 1024,
      height: 1024,
      seed: Math.floor(Math.random() * 1000000).toString(),
    });
    const URL = `${POLLINATIONS_IMAGE_API}/${encodeURIComponent(prompt)}?model=${params.get('model')}&width=${params.get('width')}&height=${params.get('height')}&seed=${params.get('seed')}`;
    const response = await fetch(`${URL}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.POLLINATIONS_TOKEN}`,
      },
      timeout: 120000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    console.log(`URL: ${URL}`);
    return {
        buffer : Buffer.from(await response.arrayBuffer()),
        url : URL
    }
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
    fs.writeFileSync(filepath, imageBuffer.buffer);
    const fileSizeKb = (imageBuffer.buffer.length / 1024).toFixed(2);

    console.log(`\n✓ Image saved successfully`);
    console.log(`  Filename: ${filename}`);
    console.log(`  Size: ${fileSizeKb} KB\n`);

    return {
        success: true,
        url : imageBuffer.url,
        
    };
  } catch (error) {
    console.error('Error generating image:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}


async function testGenerateImage() {
  const githubToken = process.env.GITHUB_TOKEN;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              TEST IMAGE GENERATION                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const prompt = await getPRsAndCreatePrompt(githubToken);
  const result = await generateAndSaveComicImage(prompt);
  console.log(result.url);


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
