/**
 * Module to fetch and merge PRs from the previous day
 * Gets merged PRs from pollinations/pollinations repo
 */

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';

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
 * Create a merged prompt covering all PR ideas
 */
function createMergedPrompt(prs) {
  if (!prs || prs.length === 0) {
    return {
      prompt: 'Pollinations: A free, open-source AI image generation platform with community updates',
      summary: 'No specific updates from previous day',
      prCount: 0,
      highlights: [],
    };
  }

  // Extract key features/fixes from PR titles and bodies
  const highlights = prs
    .slice(0, 8) // Top 8 PRs
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

  // Create a rich prompt for image generation
  const prompt = `
Create a vibrant, comic-styled illustration representing Pollinations AI updates:
- Community-driven open source AI image generation
- ${prs.length} improvements merged
- Key themes: ${[...new Set(highlights.map(h => {
    if (h.includes('bug')) return 'stability';
    if (h.includes('feature')) return 'innovation';
    if (h.includes('docs')) return 'education';
    if (h.includes('optim')) return 'performance';
    return 'growth';
  }))].join(', ')}

Visual style: Comic book aesthetic with bright colors, dynamic composition, speech bubbles showing key features. Include: code elements, flowers/bees (Pollinations theme), happy developers, colorful energy. Retro comic art style with modern vibrancy.
  `.trim();

  return {
    prompt,
    summary,
    prCount: prs.length,
    highlights,
    prs: prs.map(p => ({ number: p.number, title: p.title, url: p.url })),
  };
}

/**
 * Main export function
 */
async function getPRsAndCreatePrompt(githubToken) {
  try {
    const prs = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
    const promptData = createMergedPrompt(prs);

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

export { getMergedPRsFromPreviousDay, createMergedPrompt, getPRsAndCreatePrompt, getPreviousDayRange };
