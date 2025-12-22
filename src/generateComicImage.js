import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {getPRsAndCreatePrompt, generateTitleFromPRs} from './getPreviousDayPRs.js';
import postImageToReddit from './image_post.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POLLINATIONS_IMAGE_API = 'https://gen.pollinations.ai/image';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2;

function ensureOutputDirectory() {
  const outputDir = path.join(__dirname, '..', 'generated_images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✓ Created output directory: ${outputDir}`);
  }
  return outputDir;
}

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

async function generateAndSaveComicImage(promptData, pollinationsToken = null) {
  try {
    console.log('\n=== Generating Comic Image ===\n');

    const outputDir = ensureOutputDirectory();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `comic-${timestamp}-${Date.now()}.png`;
    const filepath = path.join(outputDir, filename);

    console.log(`Prompt: ${promptData.prompt.substring(0, 100)}...\n`);
    console.log(`Generating image...`);

    const imageBuffer = await generateImage(promptData.prompt, pollinationsToken);

    fs.writeFileSync(filepath, imageBuffer.buffer);
    const fileSizeKb = (imageBuffer.buffer.length / 1024).toFixed(2);

    console.log(`\n✓ Image saved successfully`);
    console.log(`  Filename: ${filename}`);
    console.log(`  Size: ${fileSizeKb} KB\n`);

    return {
        success: true,
        url: imageBuffer.url,
        filename: filename,
        filepath: filepath,
        fileSizeKb: fileSizeKb,
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

  const promptData = await getPRsAndCreatePrompt(githubToken);
  const result = await generateAndSaveComicImage(promptData);
  
  if (!result.success) {
    console.log('\n❌ Test failed: Failed to generate image');
    process.exit(1);
  }

  console.log('\n=== Generating Reddit Post Title ===\n');
  const title = await generateTitleFromPRs(promptData.summary, promptData.prCount);
  console.log(`Generated Title: ${title}\n`);

  console.log('\n=== Posting to Reddit ===\n');
  try {
    await postImageToReddit(result.url, title, promptData.summary);
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  TEST PASSED ✓                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testGenerateImage().catch(console.error);
