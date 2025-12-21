/**
 * Module to fetch and merge PRs from the previous day
 * Gets merged PRs from pollinations/pollinations repo
 */

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
const POLLINATIONS_API = 'https://gen.pollinations.ai/v1/chat/completions';

/**
 * Get date range for previous day
 */
function getPreviousDayRange() {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
  const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Start of yesterday
  
  return {
    startDate,
    endDate,
    dateString: startDate.toISOString().split('T')[0]
  };
}

/**
 * Fetch merged PRs from the previous day
 */
async function getMergedPRsFromPreviousDay(owner = 'pollinations', repo = 'pollinations', githubToken) {
  if (!githubToken) {
    throw new Error('GitHub token is required');
  }

  const { startDate, endDate, dateString } = getPreviousDayRange();

  const query = `
    query($owner: String!, $repo: String!, $startDate: DateTime!, $endDate: DateTime!, $cursor: String) {
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

        // Filter PRs from previous day only
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
        }
      }

      if (!pageInfo.hasNextPage) break;

      cursor = pageInfo.endCursor;
      pageNum++;
    } catch (error) {
      console.error('Fetch error:', error);
      break;
    }
  }

  console.log(`Found ${allPRs.length} merged PRs from previous day\n`);
  return allPRs;
}

/**
 * Create a merged prompt covering all PR ideas using Pollinations AI
 * Sends PR data to openai-large model for better prompt generation
 */
async function createMergedPrompt(prs, pollinationsToken) {
  if (!prs || prs.length === 0) {
    return {
      prompt: 'Pollinations: A free, open-source AI image generation platform with community updates',
      summary: 'No specific updates from previous day',
      prCount: 0,
      highlights: [],
    };
  }

  // Extract PR information
  const prList = prs.slice(0, 10).map(pr => `#${pr.number}: ${pr.title}`).join('\n');
  const categories = {};
  
  prs.forEach(pr => {
    const title = pr.title.toLowerCase();
    let category = 'update';
    
    if (title.includes('fix') || title.includes('bug')) category = 'bug fix';
    else if (title.includes('feat') || title.includes('add')) category = 'feature';
    else if (title.includes('docs')) category = 'documentation';
    else if (title.includes('perf') || title.includes('optim')) category = 'optimization';
    
    if (!categories[category]) categories[category] = [];
    categories[category].push(pr.title);
  });

  const categoryText = Object.entries(categories)
    .map(([cat, titles]) => `${cat}: ${titles.join(', ')}`)
    .join('\n');

  const systemPrompt = `You are a creative prompt engineer for comic book art generation.
Your task is to create a vibrant, engaging image prompt for comic-styled illustrations based on software development updates.
The prompt should:
- Be visually descriptive and inspiring
- Capture the essence of innovation and community collaboration
- Include comic book art style elements (bold lines, dynamic composition, vibrant colors)
- Reference the updates while maintaining artistic integrity
- Be 200-400 characters
- Include specific visual elements like bees, flowers, code, or developers
- Use the theme "Pollinations" (growth, blooming, organic development)

Output ONLY the image prompt, nothing else.`;

  const userPrompt = `Generate a comic-styled image prompt for these Pollinations AI updates:

${prList}

Categories of work:
${categoryText}

Total PRs: ${prs.length}

Create a dynamic, visually compelling comic book style prompt that celebrates these updates.`;

  try {
    console.log('Generating merged prompt using Pollinations API...');
    
    const response = await fetch(POLLINATIONS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pollinationsToken || 'sk_default'}`,
      },
      body: JSON.stringify({
        model: 'openai-large',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 500,
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

    // Create PR summary and highlights
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

    // Fallback to local prompt generation
    const comicPrompt = `Comic book style illustration celebrating ${prs.length} Pollinations updates:
${prs.slice(0, 5).map(p => p.title).join(', ')}.
Dynamic composition with bees pollinating code flowers, bright colors, retro comic aesthetic.`;

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

/**
 * Main export function
 */
async function getPRsAndCreatePrompt(githubToken, pollinationsToken) {
  try {
    const prs = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
    const promptData = await createMergedPrompt(prs, pollinationsToken);

    console.log('=== Merged PR Summary ===');
    console.log(promptData.summary);
    console.log('\n=== Generated Image Prompt ===');
    console.log(promptData.prompt);
    console.log('\n');

    return promptData;
  } catch (error) {
    console.error('Error fetching PRs:', error);
    throw error;
  }
}

/**
 * Test PR fetching
 * Usage: node getPreviousDayPRs.js <github_token> [pollinations_token]
 */
async function testPRFetching() {
  const githubToken = process.argv[2];
  const pollinationsToken = process.argv[3];

  if (!githubToken) {
    console.error('Usage: node getPreviousDayPRs.js <github_token> [pollinations_token]');
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              TEST PR FETCHING                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const result = await getPRsAndCreatePrompt(githubToken, pollinationsToken);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  TEST PASSED ✓                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`PRs Found: ${result.prCount}`);
    console.log(`Prompt Length: ${result.prompt.length} characters\n`);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test if executed directly
if (process.argv[1]?.endsWith('getPreviousDayPRs.js')) {
  testPRFetching().catch(console.error);
}

export { getMergedPRsFromPreviousDay, createMergedPrompt, getPRsAndCreatePrompt, getPreviousDayRange };
