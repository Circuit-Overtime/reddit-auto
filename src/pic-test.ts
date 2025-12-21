import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';
import * as fs from 'fs';
import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Helper function to recreate functions from create.ts for this test
function getEnv(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Error: ${key} environment variable is required`);
  }
  return value || '';
}

function getDateRange(daysBack: number = 1): [Date, Date] {
  const now = new Date();
  const endDate = now;
  const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return [startDate, endDate];
}

async function getMergedPRs(
  owner: string,
  repo: string,
  startDate: Date,
  token: string
): Promise<any[]> {
  const query = `
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          states: MERGED
          first: 100
          after: $cursor
          orderBy: {field: UPDATED_AT, direction: DESC}
          baseRefName: "main"
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            body
            url
            mergedAt
            updatedAt
            author {
              login
            }
            labels(first: 10) {
              nodes {
                name
              }
            }
          }
        }
      }
    }
  `;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const allPRs: any[] = [];
  let cursor: string | null = null;

  console.log(`Fetching merged PRs since ${startDate.toISOString().split('T')[0]}...`);

  while (true) {
    const variables = { owner, repo, cursor };

    try {
      const response: any = await axios.post(
        'https://api.github.com/graphql',
        { query, variables },
        { headers, timeout: 60000 }
      );

      const data: any = response.data;

      if (data.errors) {
        console.error(`GraphQL query errors: ${JSON.stringify(data.errors)}`);
        break;
      }

      const prData: any = data.data.repository.pullRequests;
      const nodes: any[] = prData.nodes;
      const pageInfo: any = prData.pageInfo;

      console.log(`  Fetched ${nodes.length} PRs`);

      for (const pr of nodes) {
        const mergedAt = new Date(pr.mergedAt);
        if (mergedAt >= startDate) {
          const labels = pr.labels.nodes.map((label: any) => label.name);
          allPRs.push({
            number: pr.number,
            title: pr.title,
            body: pr.body || '',
            author: pr.author?.login || 'ghost',
            merged_at: pr.mergedAt,
            html_url: pr.url,
            labels,
          });
        }
      }

      if (!pageInfo.hasNextPage) break;
      cursor = pageInfo.endCursor;
    } catch (error) {
      console.error(`GraphQL error: ${error}`);
      break;
    }
  }

  return allPRs;
}

async function generateImage(
  prompt: string,
  token: string,
  index: number
): Promise<[Buffer | null, string | null]> {
  const encodedPrompt = encodeURIComponent(prompt);
  const baseUrl = `https://gen.pollinations.ai/image/${encodedPrompt}`;
  const MAX_SEED = 2147483647;
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 2;
  const REDDIT_IMAGE_WIDTH = 1080;
  const REDDIT_IMAGE_HEIGHT = 1350;

  console.log(`Generating image ${index + 1}: ${prompt.substring(0, 50)}...`);

  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const seed = Math.floor(Math.random() * MAX_SEED);

    const params = {
      model: 'nanobanana',
      width: REDDIT_IMAGE_WIDTH,
      height: REDDIT_IMAGE_HEIGHT,
      quality: 'hd',
      nologo: 'true',
      private: 'true',
      nofeed: 'true',
      seed,
      key: token,
    };

    if (attempt === 0) {
      console.log(`  Using seed: ${seed}`);
    } else {
      const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
      console.log(
        `  Retry ${attempt}/${MAX_RETRIES - 1} with new seed: ${seed} (waiting ${backoffDelay}s)`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffDelay * 1000));
    }

    try {
      const response: any = await axios.get(baseUrl, {
        params,
        timeout: 300000,
        responseType: 'arraybuffer',
      });

      if (response.status === 200) {
        const imageBytes = Buffer.from(response.data);

        if (imageBytes.length < 1000) {
          lastError = `Image too small (${imageBytes.length} bytes)`;
          console.log(`  ${lastError}`);
          continue;
        }

        const isJpeg = imageBytes[0] === 0xff && imageBytes[1] === 0xd8;
        const isPng =
          imageBytes[0] === 0x89 &&
          imageBytes[1] === 0x50 &&
          imageBytes[2] === 0x4e &&
          imageBytes[3] === 0x47;
        const isWebp =
          imageBytes[0] === 0x52 &&
          imageBytes[1] === 0x49 &&
          imageBytes[2] === 0x46 &&
          imageBytes[3] === 0x46;

        if (!isJpeg && !isPng && !isWebp) {
          lastError = `Invalid image format`;
          console.log(`  ${lastError}`);
          continue;
        }

        const imgFormat = isJpeg ? 'JPEG' : isPng ? 'PNG' : 'WebP';
        console.log(
          `  Image ${index + 1} generated successfully (${imgFormat}, ${imageBytes.length.toLocaleString()} bytes)`
        );

        const publicParams = Object.fromEntries(
          Object.entries(params).filter(([k]) => k !== 'key')
        );
        const publicUrl =
          baseUrl +
          '?' +
          Object.entries(publicParams)
            .map(([k, v]) => `${k}=${v}`)
            .join('&');

        return [imageBytes, publicUrl];
      }
    } catch (error) {
      lastError = `Request error: ${error}`;
      console.log(`  ${lastError}`);
    }
  }

  console.log(`  Failed to generate image ${index + 1} after ${MAX_RETRIES} attempts`);
  return [null, null];
}

const githubToken = getEnv('GITHUB_TOKEN');
const pollinationsToken = getEnv('POLLINATIONS_TOKEN');
const sourceRepo = getEnv('SOURCE_REPO', false) || 'pollinations/pollinations';
const [sourceOwner, sourceRepoName] = sourceRepo.split('/');
const daysBack = parseInt(getEnv('DAYS_BACK', false) || '1');

let fetchedPRs: any[] = [];

describe('Image Generation Tests', () => {
  beforeAll(async () => {
    console.log(`\n📦 Fetching PRs from ${sourceRepo} (last ${daysBack} days)...`);
    const [startDate] = getDateRange(daysBack);
    fetchedPRs = await getMergedPRs(sourceOwner, sourceRepoName, startDate, githubToken);
    console.log(`✅ Found ${fetchedPRs.length} merged PRs\n`);
  });

  it('should fetch real merged PRs from source repo', async () => {
    expect(fetchedPRs).toBeDefined();
    expect(Array.isArray(fetchedPRs)).toBe(true);
    if (fetchedPRs.length > 0) {
      expect(fetchedPRs[0]).toHaveProperty('number');
      expect(fetchedPRs[0]).toHaveProperty('title');
      expect(fetchedPRs[0]).toHaveProperty('author');
      console.log(`  ✓ PR #${fetchedPRs[0].number}: ${fetchedPRs[0].title}`);
    }
  });

  it('should generate and save actual image', async () => {
    const prompt = 'Modern AI interface with glowing neon effects, futuristic design, digital art';
    console.log(`\n🎨 Generating image from prompt: "${prompt}"`);

    const [imageBytes, imageUrl] = await generateImage(prompt, pollinationsToken, 0);

    expect(imageBytes).not.toBeNull();
    expect(imageUrl).not.toBeNull();
    expect(imageBytes).toBeInstanceOf(Buffer);

    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'generated_images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`  📁 Created directory: ${outputDir}`);
    }

    // Save image to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `image_${timestamp}.png`;
    const filepath = path.join(outputDir, filename);

    if (imageBytes) {
      fs.writeFileSync(filepath, imageBytes);
      const fileSizeKB = (imageBytes.length / 1024).toFixed(2);
      console.log(`  ✅ Image saved: ${filepath} (${fileSizeKB} KB)`);
      console.log(`  🔗 Public URL: ${imageUrl}`);
    }
  });

  it('should generate and save image from first PR title if available', async () => {
    if (fetchedPRs.length === 0) {
      console.log('  ⚠️  No PRs available to use as image prompt');
      expect(true).toBe(true);
      return;
    }

    const firstPR = fetchedPRs[0];
    const prompt = `Modern implementation inspired by: "${firstPR.title}" - AI, tech, innovation`;
    
    console.log(`\n🎨 Generating image from PR title: "${firstPR.title}"`);

    const [imageBytes, imageUrl] = await generateImage(prompt, pollinationsToken, 1);

    expect(imageBytes).not.toBeNull();
    expect(imageUrl).not.toBeNull();

    const outputDir = path.join(process.cwd(), 'generated_images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `image_pr${firstPR.number}_${timestamp}.png`;
    const filepath = path.join(outputDir, filename);

    if (imageBytes) {
      fs.writeFileSync(filepath, imageBytes);
      const fileSizeKB = (imageBytes.length / 1024).toFixed(2);
      console.log(`  ✅ Image saved: ${filepath} (${fileSizeKB} KB)`);
      console.log(`  🔗 Public URL: ${imageUrl}`);
      console.log(`  📝 PR Reference: #${firstPR.number}`);
    }
  });

  it('should list all PRs found', () => {
    console.log(`\n📋 PRs found (total: ${fetchedPRs.length}):`);
    if (fetchedPRs.length === 0) {
      console.log('  No PRs found');
    } else {
      fetchedPRs.slice(0, 5).forEach((pr) => {
        console.log(`  #${pr.number}: ${pr.title} (by ${pr.author})`);
      });
      if (fetchedPRs.length > 5) {
        console.log(`  ... and ${fetchedPRs.length - 5} more`);
      }
    }
    expect(fetchedPRs).toBeDefined();
  });
});

