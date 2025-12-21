import * as fs from "fs";
import * as path from "path";
import axios, { AxiosError } from "axios";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_GRAPHQL_API = "https://api.github.com/graphql";
const POLLINATIONS_API_BASE = "https://gen.pollinations.ai/v1/chat/completions";
const POLLINATIONS_IMAGE_BASE = "https://gen.pollinations.ai/image";
const MODEL = "gemini-large";
const IMAGE_MODEL = "nanobanana";
const MAX_SEED = 2147483647;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2;
const REDDIT_IMAGE_WIDTH = 1080;
const REDDIT_IMAGE_HEIGHT = 1350;

interface PR {
    number: number;
    title: string;
    body: string;
    author: string;
    merged_at: string;
    html_url: string;
    labels: string[];
}

interface RedditStrategy {
    subreddit: string;
    post_type: string;
    title: string;
    body: string;
    has_image: boolean;
    image_prompt?: string;
    image_description?: string;
    strategy_reasoning?: string;
    engagement_plan?: string[];
    hashtags?: string[];
    cross_post_to?: string[];
}

function getEnv(key: string, required: boolean = true): string {
    const value = process.env[key];
    if (required && !value) {
        console.error(`Error: ${key} environment variable is required`);
        process.exit(1);
    }
    return value || "";
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
): Promise<PR[]> {
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
        "Content-Type": "application/json",
    };

    const allPRs: PR[] = [];
    let cursor: string | null = null;
    let page = 1;

    console.log(
        `Fetching merged PRs since ${startDate.toISOString().split("T")[0]}...`
    );

    while (true) {
        const variables: { owner: string; repo: string; cursor: string | null } = { owner, repo, cursor };

        try {
            const response: any = await axios.post(GITHUB_GRAPHQL_API, {
                query,
                variables,
                headers,
                timeout: 60000,
            });

            const data: any = response.data;

            if (data.errors) {
                console.error(`GraphQL query errors: ${JSON.stringify(data.errors)}`);
                return [];
            }

            const prData: any = data.data.repository.pullRequests;
            const nodes: any[] = prData.nodes;
            const pageInfo: any = prData.pageInfo;

            console.log(`  Page ${page}: fetched ${nodes.length} PRs`);

            let oldestUpdateOnPage: Date | null = null;

            for (const pr of nodes) {
                const mergedAt = new Date(pr.mergedAt);
                const updatedAt = new Date(pr.updatedAt);

                if (!oldestUpdateOnPage || updatedAt < oldestUpdateOnPage) {
                    oldestUpdateOnPage = updatedAt;
                }

                if (mergedAt >= startDate) {
                    const labels = pr.labels.nodes.map((label: any) => label.name);
                    allPRs.push({
                        number: pr.number,
                        title: pr.title,
                        body: pr.body || "",
                        author: pr.author?.login || "ghost",
                        merged_at: pr.mergedAt,
                        html_url: pr.url,
                        labels,
                    });
                }
            }

            if (oldestUpdateOnPage && oldestUpdateOnPage < startDate) {
                console.log(
                    `  Reached PRs last updated before ${startDate.toISOString().split("T")[0]}, stopping`
                );
                break;
            }

            if (!pageInfo.hasNextPage) break;

            cursor = pageInfo.endCursor;
            page++;
        } catch (error) {
            const err = error as AxiosError;
            console.error(
                `GraphQL error: ${err.response?.status} -> ${JSON.stringify(err.response?.data).substring(0, 500)}`
            );
            return [];
        }
    }

    return allPRs;
}

async function callPollinationsAPI(
    systemPrompt: string,
    userPrompt: string,
    token: string,
    temperature: number = 0.7,
    model?: string,
    verbose: boolean = true
): Promise<string | null> {
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const useModel = model || MODEL;
    let lastError: string | null = null;

    if (verbose) {
        console.log(`\n  [VERBOSE] API Call to ${POLLINATIONS_API_BASE}`);
        console.log(`  [VERBOSE] Model: ${useModel}`);
        console.log(`  [VERBOSE] Temperature: ${temperature}`);
        console.log(`  [VERBOSE] System prompt (${systemPrompt.length} chars):`);
        console.log(`  ---BEGIN SYSTEM PROMPT---`);
        console.log(
            systemPrompt.substring(0, 2000) +
                (systemPrompt.length > 2000 ? "..." : "")
        );
        console.log(`  ---END SYSTEM PROMPT---`);
        console.log(`  [VERBOSE] User prompt (${userPrompt.length} chars):`);
        console.log(`  ---BEGIN USER PROMPT---`);
        console.log(
            userPrompt.substring(0, 2000) + (userPrompt.length > 2000 ? "..." : "")
        );
        console.log(`  ---END USER PROMPT---`);
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = Math.floor(Math.random() * MAX_SEED);

        const payload = {
            model: useModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature,
            seed,
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
            const response = await axios.post(POLLINATIONS_API_BASE, payload, {
                headers,
                timeout: 120000,
            });

            if (response.status === 200) {
                try {
                    const result = response.data;
                    const content = result.choices[0].message.content;

                    if (verbose) {
                        console.log(`  [VERBOSE] Response (${content.length} chars):`);
                        console.log(`  ---BEGIN RESPONSE---`);
                        console.log(
                            content.substring(0, 3000) + (content.length > 3000 ? "..." : "")
                        );
                        console.log(`  ---END RESPONSE---`);
                    }

                    return content;
                } catch (error) {
                    lastError = `Error parsing API response: ${error}`;
                    console.log(`  ${lastError}`);
                }
            }
        } catch (error) {
            const err = error as AxiosError;
            lastError = `API error: ${err.response?.status || err.message}`;
            console.log(`  ${lastError}`);
        }
    }

    console.log(
        `All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`
    );
    return null;
}

function getRedditTrends(): Record<string, any> {
    return {
        subreddits: [
            "r/OpenSource",
            "r/programming",
            "r/IndieGaming",
            "r/WebDev",
            "r/learnprogramming",
            "r/gamedev",
        ],
        trending_content_types: [
            "Educational threads (tutorials, how-tos)",
            "Project showcase threads (code/results)",
            "Discussion posts (opinions, debates)",
            "Success stories (launched product, X users)",
            "Meme posts (relatable developer humor)",
            "Q&A threads (seeking advice)",
        ],
        engagement_patterns: [
            "Ask questions in title (invites comments)",
            "Before/after comparisons (visual engagement)",
            "Top 5/10 lists (easily scannable)",
            "Controversial takes (generates discussion)",
            "Behind-the-scenes (humanizes the project)",
            "Humble brag format (relatable success)",
            "Help request threads (community driven)",
        ],
        humor_themes: [
            "Developer struggles (imposter syndrome, debugging)",
            "AI memes (expectations vs reality)",
            "Open source stereotypes",
            "Procrastination & coffee jokes",
            "Naming convention debates",
            "Regex/CSS jokes",
        ],
        visual_content_style: [
            "Pixel art memes (retro aesthetic)",
            "Code screenshots with annotations",
            "Progress bars/diagrams",
            "Comparison images (side by side)",
            "Infographics (stats, timelines)",
            "Workflow diagrams",
        ],
        post_formats: [
            "Title + image (highest engagement)",
            "Title + image + comment (OP engagement)",
            "Text post with formatted content",
            "Link post (to external resource)",
            "Cross-post (from another subreddit)",
        ],
        optimal_length: {
            title: "50-80 characters",
            comment: "100-500 characters",
            post_body: "200-1000 characters",
        },
    };
}

async function generateRedditPostStrategy(
    prs: PR[],
    trends: Record<string, any>,
    token: string
): Promise<RedditStrategy | null> {
    const today = new Date().toISOString().split("T")[0];

    let prSummary = "";
    const updateCount = prs.length;

    if (prs.length > 0) {
        prSummary = `TODAY'S UPDATES (${updateCount} merged PRs):\n`;
        for (const pr of prs.slice(0, 10)) {
            const labelsStr = pr.labels.length > 0 ? ` [${pr.labels.join(", ")}]` : "";
            prSummary += `- #${pr.number}: ${pr.title}${labelsStr}\n`;
            if (pr.body) {
                prSummary += `  ${pr.body.substring(0, 150)}...\n`;
            }
        }
    } else {
        prSummary = "NO UPDATES TODAY";
    }

    const systemPrompt = `You are a seasoned Reddit poster for Pollinations.AI.
Pollinations.AI is a free, open-source AI image generation platform - no login, no BS, just free AI art.

YOUR MISSION: Create engaging Reddit posts that spark discussion, education, or humor while showcasing Pollinations updates.

${prSummary}

=== POLLINATIONS BRAND ON REDDIT ===
- Community-first approach (help other devs, share knowledge)
- "No BS" energy - authentic, technical, straightforward
- Anti-corporate (we're indie developers building in public)
- Open source values (free tools for everyone)
- Growth through community evangelism, not marketing

=== REDDIT POST GUIDELINES ===

**POST TYPES (choose ONE):**
1. PROJECT SHOWCASE: "Check out what's new in Pollinations" - Show actual results/features
2. DISCUSSION: "Hot take: Free AI art tools should..." - Spark conversation
3. HELP THREAD: "Someone asked how to do X with Pollinations..." - Educational
4. MEME/HUMOR: Relatable dev humor + subtle Pollinations mention
5. BEHIND-THE-SCENES: "Here's how we built X feature..." - Technical deep-dive
6. SUCCESS STORY: "Built X app with Pollinations and got Y users" - Social proof

**TITLE TIPS:**
- 50-80 characters (Reddit sweet spot)
- Ask a question OR make a bold statement
- Include relevant subreddit keyword (AI, OpenSource, Dev, etc)
- No clickbait - be honest
- Avoid emoji (let text speak for itself)

**BODY CONTENT (200-1000 chars):**
- Lead with WHY (why should readers care?)
- Explain WHAT (what's the actual thing?)
- Share HOW (technical details for credibility)
- Call to ACTION (comment, upvote, try it)
- Be conversational, not marketing speak

**OUTPUT FORMAT (JSON only) ===
{
        "subreddit": "r/OpenSource|r/programming|r/IndieGaming",
        "post_type": "showcase|discussion|help_thread|meme|behind_the_scenes|success_story",
        "title": "Your compelling post title (50-80 chars)",
        "body": "Post body content",
        "has_image": true|false,
        "image_prompt": "If has_image, detailed prompt",
        "image_description": "What the image shows",
        "strategy_reasoning": "Why this will resonate",
        "engagement_plan": ["Strategy 1", "Strategy 2"],
        "hashtags": ["#pollinations", "#opensource"]
}`;

    const userPrompt =
        prs.length > 0
            ? `Create a Reddit post about these updates: ${prs.slice(0, 5).map((pr) => pr.title).join(", ")}\n\nPick the best subreddit and post type. Focus on community value, not marketing.\nOutput valid JSON only.`
            : `No code updates today - create community engagement content!\n\nOutput valid JSON only.`;

    console.log("Generating Reddit post strategy...");
    const response: string | null = await callPollinationsAPI(
        systemPrompt,
        userPrompt,
        token,
        0.8
    );

    if (!response) {
        console.log("Strategy generation failed");
        return null;
    }

    try {
        let json = response.trim();
        if (json.startsWith("```")) {
            const lines = json.split("\n");
            json = lines.filter((l) => !l.startsWith("```")).join("\n");
        }

        const strategy = JSON.parse(json) as RedditStrategy;
        console.log(`Strategy: ${strategy.post_type} for ${strategy.subreddit}`);
        console.log(`Title: ${strategy.title}`);
        return strategy;
    } catch (error) {
        console.error(`Failed to parse strategy: ${error}`);
        console.log(`Response was: ${response.substring(0, 500)}`);
        return null;
    }
}

async function generateImage(
    prompt: string,
    token: string,
    index: number
): Promise<[Buffer | null, string | null]> {
    const encodedPrompt = encodeURIComponent(prompt);
    const baseUrl = `${POLLINATIONS_IMAGE_BASE}/${encodedPrompt}`;

    console.log(`Generating image ${index + 1}: ${prompt.substring(0, 50)}...`);

    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = Math.floor(Math.random() * MAX_SEED);

        const params = {
            model: IMAGE_MODEL,
            width: REDDIT_IMAGE_WIDTH,
            height: REDDIT_IMAGE_HEIGHT,
            quality: "hd",
            nologo: "true",
            private: "true",
            nofeed: "true",
            seed,
            key: token,
        };

        if (attempt === 0) {
            console.log(`  Using seed: ${seed}`);
        } else {
            const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
            console.log(
                `  Retry ${attempt}/${MAX_RETRIES - 1} with new seed: ${seed}`
            );
            await new Promise((resolve) => setTimeout(resolve, backoffDelay * 1000));
        }

        try {
            const response = await axios.get(baseUrl, {
                params,
                timeout: 300000,
                responseType: "arraybuffer",
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

                const imgFormat = isJpeg ? "JPEG" : isPng ? "PNG" : "WebP";
                console.log(
                    `  Image ${index + 1} generated successfully (${imgFormat}, ${imageBytes.length.toLocaleString()} bytes)`
                );

                const publicParams = Object.fromEntries(
                    Object.entries(params).filter(([k]) => k !== "key")
                );
                const publicUrl =
                    baseUrl +
                    "?" +
                    Object.entries(publicParams)
                        .map(([k, v]) => `${k}=${v}`)
                        .join("&");

                return [imageBytes, publicUrl];
            }
        } catch (error) {
            const err = error as AxiosError;
            lastError = `Request error: ${err.message}`;
            console.log(`  ${lastError}`);
        }
    }

    console.log(`  Failed to generate image ${index + 1} after ${MAX_RETRIES} attempts`);
    return [null, null];
}

async function createRedditPostPR(
    strategy: RedditStrategy,
    image: Buffer | null,
    imageUrl: string | null,
    prs: PR[],
    githubToken: string,
    owner: string,
    repo: string
): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    const headers = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
    };

    try {
        // Get base branch SHA
        const refResponse = await axios.get(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/main`,
            { headers }
        );

        const baseSha = refResponse.data.object.sha;

        // Create new branch
        const branchName = `reddit-post-${today}`;

        try {
            await axios.post(
                `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs`,
                { ref: `refs/heads/${branchName}`, sha: baseSha },
                { headers }
            );
            console.log(`Created branch: ${branchName}`);
        } catch (error) {
            const err = error as AxiosError;
            if (!err.response?.data?.toString().includes("Reference already exists")) {
                throw error;
            }
            console.log(`Branch ${branchName} already exists, updating...`);
        }

        // Create JSON post data
        const postData = {
            date: today,
            generated_at: new Date().toISOString(),
            subreddit: strategy.subreddit || "r/OpenSource",
            post_type: strategy.post_type || "showcase",
            title: strategy.title || "",
            body: strategy.body || "",
            has_image: strategy.has_image || false,
            image_url: image && imageUrl ? imageUrl : null,
            image_description: strategy.image_description || "",
            strategy_reasoning: strategy.strategy_reasoning || "",
            engagement_plan: strategy.engagement_plan || [],
            hashtags: strategy.hashtags || [],
            cross_post_to: strategy.cross_post_to || [],
            pr_references: prs.length > 0 ? prs.map((pr) => `#${pr.number}`) : [],
        };

        const jsonPath = `NEWS/transformed/reddit/posts/${today}.json`;
        const jsonContent = JSON.stringify(postData, null, 2);
        const jsonEncoded = Buffer.from(jsonContent).toString("base64");

        await axios.put(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${jsonPath}`,
            {
                message: `reddit: add post for ${today}`,
                content: jsonEncoded,
                branch: branchName,
            },
            { headers }
        );

        console.log(`Created ${jsonPath}`);

        // Create PR
        const prTitle = `Reddit Post - ${today}`;
        const engagementPlanStr = postData.engagement_plan
            .map((item) => `- ${item}`)
            .join("\n");
        const imagePreview = imageUrl
            ? `\n### Image Preview\n${strategy.image_description}\n![Preview](${imageUrl})\n`
            : "";

        const prBody = `## Reddit Post for ${today}

**Subreddit:** ${postData.subreddit}
**Post Type:** ${postData.post_type}

### Title
${postData.title}

### Body
${postData.body}

### Strategy
${postData.strategy_reasoning}

### Engagement Plan
${engagementPlanStr}

### Hashtags
${postData.hashtags.join(" ")}

${imagePreview}

---
**PR References:** ${postData.pr_references.length > 0 ? postData.pr_references.join(", ") : "None (community content)"}

When this PR is merged, the post will be automatically posted to Reddit.

Generated automatically by GitHub Actions
`;

        const prResponse = await axios.post(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`,
            {
                title: prTitle,
                body: prBody,
                head: branchName,
                base: "main",
            },
            { headers }
        );

        console.log(`Created PR #${prResponse.data.number}: ${prResponse.data.html_url}`);
    } catch (error) {
        const err = error as AxiosError;
        console.error(`Error creating PR: ${JSON.stringify(err.response?.data)}`);
    }
}

async function main() {
    const githubToken = getEnv("GITHUB_TOKEN");
    const pollinationsToken = getEnv("POLLINATIONS_TOKEN");
    const repoFullName = getEnv("GITHUB_REPOSITORY");
    const sourceRepo = getEnv("SOURCE_REPO", false) || "pollinations/pollinations";
    const daysBack = parseInt(getEnv("DAYS_BACK", false) || "1");

    const [ownerName, repoName] = repoFullName.split("/");
    const [sourceOwner, sourceRepoName] = sourceRepo.split("/");

    console.log("\n=== Fetching PRs ===");
    const [startDate] = getDateRange(daysBack);
    const mergedPRs = await getMergedPRs(
        sourceOwner,
        sourceRepoName,
        startDate,
        githubToken
    );
    console.log(`Found ${mergedPRs.length} merged PRs`);

    console.log("\n=== Loading Reddit Trends ===");
    const trends = getRedditTrends();
    console.log(`Loaded trends for ${trends.subreddits.length} subreddits`);

    console.log("\n=== Generating Reddit Post Strategy ===");
    const strategy = await generateRedditPostStrategy(
        mergedPRs,
        trends,
        pollinationsToken
    );

    if (!strategy) {
        console.log("Failed to generate strategy. Exiting.");
        process.exit(1);
    }

    const finalStrategy: RedditStrategy = strategy;
    let imageBytes: Buffer | null = null;
    let imageUrl: string | null = null;

    if (finalStrategy.has_image && finalStrategy.image_prompt) {
        console.log("\n=== Generating Image ===");
        [imageBytes, imageUrl] = await generateImage(
            finalStrategy.image_prompt,
            pollinationsToken,
            0
        );
        if (!imageBytes) {
            console.log("Image generation failed, continuing without image");
        }
    }

    console.log("\n=== Creating PR ===");
    await createRedditPostPR(
        finalStrategy,
        imageBytes,
        imageUrl,
        mergedPRs,
        githubToken,
        ownerName,
        repoName
    );

    console.log("\n=== Done! ===");
}

// main().catch(console.error);

