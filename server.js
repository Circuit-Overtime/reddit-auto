import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POLLINATIONS_IMAGE_API = 'https://gen.pollinations.ai/image';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
const POLLINATIONS_API = 'https://gen.pollinations.ai/v1/chat/completions';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2;

function getPreviousDayRange() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    return {
        startDate,
        endDate,
    };
}

function ensureOutputDirectory() {
    const outputDir = path.join(__dirname, '..', 'generated_images');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`✓ Created output directory: ${outputDir}`);
    }
    return outputDir;
}

async function getMergedPRsFromPreviousDay(owner = 'pollinations', repo = 'pollinations', githubToken) {
    if (!githubToken) {
        throw new Error('GitHub token is required');
    }

    const { startDate, endDate } = getPreviousDayRange();
    const dateString = startDate.toISOString().split('T')[0];

    const query = `
        query($owner: String!, $repo: String!, $cursor: String) {
            repository(owner: $owner, name: $repo) {
                pullRequests(
                    states: MERGED
                    first: 100
                    after: $cursor
                    orderBy: {field: UPDATED_AT, direction: DESC}
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
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
    };

    const allPRs = [];
    let cursor = null;

    console.log(`\n=== Fetching PRs from ${dateString} ===`);
    console.log(`Time range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    let pageNum = 1;

    while (true) {
        const variables = {
            owner,
            repo,
            cursor,
        };

        try {
            const response = await fetch(GITHUB_GRAPHQL_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    query,
                    variables,
                }),
            });

            const data = await response.json();

            if (data.errors) {
                console.error('GraphQL errors:', data.errors);
                break;
            }

            const prData = data.data.repository.pullRequests;
            const nodes = prData.nodes;
            const pageInfo = prData.pageInfo;

            console.log(`  Page ${pageNum}: fetched ${nodes.length} PRs`);

            for (const pr of nodes) {
                const mergedDate = new Date(pr.mergedAt);

                if (mergedDate >= startDate && mergedDate < endDate) {
                    allPRs.push({
                        number: pr.number,
                        title: pr.title,
                        body: pr.body || '',
                        url: pr.url,
                        author: pr.author?.login || 'unknown',
                        labels: pr.labels?.nodes?.map(l => l.name) || [],
                        mergedAt: pr.mergedAt,
                    });
                } else if (mergedDate < startDate) {
                    console.log(`  Stopping: reached PRs before ${dateString}`);
                    pageNum = 999;
                    break;
                }
            }

            if (!pageInfo.hasNextPage || pageNum > 100) break;

            cursor = pageInfo.endCursor;
            pageNum++;
        } catch (error) {
            console.error('Fetch error:', error);
            break;
        }
    }

    console.log(`Found ${allPRs.length} merged PRs from previous day\n`);
    return { prs: allPRs, dateString };
}

async function createMergedPrompt(prs, dateString) {
    if (!prs || prs.length === 0) {
        return {
            prompt: 'Pollinations: A free, open-source AI image generation platform with community updates',
            summary: 'No specific updates from previous day',
            prCount: 0,
            highlights: [],
        };
    }

    const prList = prs.slice(0, 10).map(pr => pr.title).join(', ');

    const systemPrompt = `Output SHORT image prompt (2-3 sentences). Create nature-themed comic flowchart with updates as distinct natural elements (flowers, trees, creatures, vines). Bug fixes=pruned branches, Features=blooming flowers, Refactors=reorganized paths, Infrastructure=nesting animals. Bright comic style: emerald, golden, sky blue, orange, purple. Dynamic energy: wind, pollen, water, bee flight paths. Strip all dates, counts, metrics. ONLY output the image prompt.`
    const userPrompt = `Nature-themed comic flowchart: ${prList}
Short prompt only. No dates, counts, metadata.`

    try {
        console.log('Generating merged prompt using Pollinations API...');
        
        const response = await fetch(POLLINATIONS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.POLLINATIONS_TOKEN}`,
            },
            body: JSON.stringify({
                model: 'openai-large',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 250,
                seed: 42,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.warn(`API warning: ${response.status} - ${JSON.stringify(errorData).substring(0, 200)}`);
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const generatedPrompt = data.choices?.[0]?.message?.content?.trim();

        if (!generatedPrompt) {
            throw new Error('No prompt generated from API');
        }

        const highlights = prs
            .slice(0, 8)
            .map(pr => {
                const title = pr.title.toLowerCase();
                let category = 'update';
                if (title.includes('fix') || title.includes('bug')) category = 'bug fix';
                else if (title.includes('feat') || title.includes('add')) category = 'feature';
                else if (title.includes('docs')) category = 'documentation';
                else if (title.includes('perf') || title.includes('optim')) category = 'optimization';
                return `${category}: ${pr.title}`;
            });

        const summary = `
${prs.length} PRs merged:
${highlights.map(h => `• ${h}`).join('\n')}
        `.trim();

        console.log('✓ Prompt generated successfully\n');
        console.log('Generated Prompt:');
        console.log(generatedPrompt);
        console.log('');

        return {
            prompt: generatedPrompt,
            summary,
            prCount: prs.length,
            highlights,
            prs: prs.map(p => ({ number: p.number, title: p.title, url: p.url })),
        };
    } catch (error) {
        console.warn(`Prompt generation failed: ${error.message}`);
        console.log('Falling back to local prompt generation...\n');

        const comicPrompt = `Comic book style illustration celebrating ${prs.length} Pollinations updates:
${prs.slice(0, 5).map(p => p.title).join(', ')}.
Dynamic composition with bees pollinating code flowers, bright colors, retro comic aesthetic.
Write in pure plain text, no metadata or extra commentary or markdown`;

        const highlights = prs
            .slice(0, 8)
            .map(pr => {
                const title = pr.title.toLowerCase();
                let category = 'update';
                if (title.includes('fix') || title.includes('bug')) category = 'bug fix';
                else if (title.includes('feat') || title.includes('add')) category = 'feature';
                else if (title.includes('docs')) category = 'documentation';
                else if (title.includes('perf') || title.includes('optim')) category = 'optimization';
                return `${category}: ${pr.title}`;
            });

        return {
            prompt: comicPrompt,
            summary: `${prs.length} PRs merged (fallback)`,
            prCount: prs.length,
            highlights,
            prs: prs.map(p => ({ number: p.number, title: p.title, url: p.url })),
        };
    }
}

async function getPRsAndCreatePrompt(githubToken) {
    try {
        const { prs, dateString } = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
        const promptData = await createMergedPrompt(prs, dateString);
        console.log('\n=== Generated Image Prompt ===');
        console.log(promptData.prompt);
        console.log('\n');

        return promptData;
    } catch (error) {
        console.error('Error fetching PRs:', error);
        throw error;
    }
}

async function generateTitleFromPRs(prSummary, prCount) {
    try {
        const systemPrompt = `You are a Reddit post title generator. Create an engaging, catchy post title (max 12 words) for a development update. Be enthusiastic but professional. No brackets, no metrics.`;
        const userPrompt = `Generate a Reddit post title for this dev update:
${prSummary}

Title only, no explanation.`;

        const response = await fetch(POLLINATIONS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.POLLINATIONS_TOKEN}`,
            },
            body: JSON.stringify({
                model: 'openai-large',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.8,
                max_tokens: 60,
            }),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        let title = data.choices?.[0]?.message?.content?.trim() || '';
        
        title = title.replace(/^["']|["']$/g, '').trim();
        
        if (!title || title.length < 5) {
            title = `Pollinations: ${prCount} Updates Shipped`;
        }

        return title;
    } catch (error) {
        console.error('PR title generation failed:', error.message);
        return `Pollinations: ${prCount} Updates Shipped`;
    }
}

async function generateImage(prompt, attempt = 0) {
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
            seed: 42,
        });
        const URL = `${POLLINATIONS_IMAGE_API}/${encodeURIComponent(prompt)}?model=${params.get('model')}&width=${params.get('width')}&height=${params.get('height')}&seed=${params.get('seed')}`;
        const response = await fetch(URL, {
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
                buffer: Buffer.from(await response.arrayBuffer()),
                url: URL
        }
    } catch (error) {
        if (attempt < MAX_RETRIES - 1) {
            console.log(`  ✗ Attempt ${attempt + 1} failed: ${error.message}`);
            return generateImage(prompt, attempt + 1);
        }
        throw error;
    }
}

async function generateAndSaveComicImage(promptData) {
    try {
        console.log('\n=== Generating Comic Image ===\n');

        const outputDir = ensureOutputDirectory();
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `comic-${timestamp}-${Date.now()}.png`;
        const filepath = path.join(outputDir, filename);

        console.log(`Prompt: ${promptData.prompt.substring(0, 100)}...\n`);
        console.log(`Generating image...`);

        const imageBuffer = await generateImage(promptData.prompt);

        fs.writeFileSync(filepath, imageBuffer.buffer);
        const fileSizeKb = (imageBuffer.buffer.length / 1024).toFixed(2);

        console.log(`\n✓ Image saved successfully`);
        console.log(`  Filename: ${filename}`);
        console.log(`  Size: ${fileSizeKb} KB\n`);

        return {
                success: true,
                buffer: imageBuffer.buffer,
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

async function postImageToSubreddit(
    context,
    subredditName,
    title,
    imageBinary
) {
    const upload = await context.reddit.uploadMedia({
        subredditName,
        mimeType: 'image/png',
        data: imageBinary,
    });

    if (!upload || !upload.mediaId) {
        throw new Error('Reddit image upload failed');
    }

    const post = await context.reddit.submitPost({
        subredditName,
        title,
        mediaId: upload.mediaId,
    });

    console.log(`✓ Posted to r/${subredditName}: https://reddit.com${post.permalink}`);
    return post;
}

export async function onTrigger(context) {
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
        await postImageToSubreddit(
            context,
            'pollinations_ai',
            title,
            result.buffer
        );
        
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║                  TEST PASSED ✓                            ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
    } catch (error) {
        console.log('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}
