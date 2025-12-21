/**
 * Module to fetch and merge PRs from the previous day
 * Gets merged PRs from pollinations/pollinations repo
 */

import dotenv from 'dotenv';
dotenv.config();
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

        // Filter PRs from previous day only (stop if we go before previous day)
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
          // Stop fetching if we've gone past the previous day
          console.log(`  Stopping: reached PRs before ${dateString}`);
          pageNum = 999; // Force exit of while loop
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

/**
 * Create a merged prompt covering all PR ideas using Pollinations AI
 * Sends PR data to openai-large model for better prompt generation
 */
async function createMergedPrompt(prs, dateString) {
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

  const systemPrompt = `
                        You are a senior visual narrative designer specializing in nature-inspired comic-book splash panels.
                        Your role is to transform real software development updates into a single, coherent, vibrant botanical-cybernetic illustration for Pollinations.

                        CORE IDENTITY (NON-NEGOTIABLE):
                        Pollinations represents growth, cross-pollination, openness, ecosystems, and collective flourishing.
                        All visuals must be nature-first, organic, celebratory, and alive.

                        ABSOLUTE CONSTRAINTS:
                        1. Never mention:
                        - Dates
                        - Pull request numbers
                        - Counts as numerals
                        - GitHub, PRs, commits, repositories, or contributors explicitly
                        2. Do not explain metaphors or break the illusion.
                        3. Output ONLY a single image-generation prompt. No commentary.

                        INFORMATION PRESERVATION RULE:
                        Every distinct update provided MUST be represented by a distinct, clearly identifiable natural element in the scene.
                        Semantic meaning must be preserved exactly through metaphor, not diluted.

                        NATURE METAPHOR MAPPING (STRICT):
                        - Bug fixes → pests removed, blight cleared, invasive weeds uprooted, diseased branches pruned
                        - New features → new flowers blooming, rare plants sprouting, seeds germinating, new species appearing
                        - Documentation → leaves unfurling with patterns, tree rings revealing knowledge, spores carrying wisdom
                        - Refactors / cleanup → gardens reorganized, paths clarified, tangled roots separated
                        - Optimizations / performance → accelerated growth, stronger winds, flowing rivers, seasonal shifts
                        - APIs / integrations → vines interconnecting ecosystems, mycelium networks, shared root systems
                        - Tooling / infra → animals arriving (bees, birds, insects), nests forming, habitats stabilizing

                        COUNT REPRESENTATION RULE:
                        The total number of updates MUST be shown visually through:
                        - One natural element per update
                        - Repetition (multiple flowers, vines, creatures, leaves)
                        - Spatial grouping
                        Never state quantities explicitly.

                        COMPOSITION REQUIREMENTS:
                        - Single wide comic-book splash panel
                        - Central thriving ecosystem (garden, forest, meadow, greenhouse)
                        - Clear separation between elements representing different updates
                        - Visual motion: wind, rain, pollen clouds, flowing water, growing vines
                        - Cooperative agents: gardeners, nature spirits, animals working together
                        - Visible transformation (before/after energy embedded in the scene)

                        STYLE & ENERGY:
                        - Bold comic inks
                        - Organic linework
                        - Natural color palette only (forest greens, soil browns, sky blues, sunset oranges, floral purples)
                        - No neon, no cyberpunk aesthetics
                        - Mood: optimistic, regenerative, celebratory, alive

                        POLLINATIONS SIGNATURE ELEMENTS (WEAVE SUBTLY):
                        - Bees actively pollinating
                        - Flowers exchanging pollen
                        - Seeds traveling between plants
                        - Ecosystems blending into each other
                        - Growth spreading outward
                        Don't put any markdown formatting simply return a single prompt. 
`
const userPrompt = `Generate a NATURE-THEMED comic-book splash panel for these Pollinations AI updates:
                    ${prList}
                    BREAKDOWN:
                    ${categoryText}
                    Show ${prs.length} distinct natural elements (flowers, vines, animals, growth) - one per update.
                    Use nature metaphors: bugs = pests removed, features = new blooms, docs = unfurling leaves, optimization = accelerated growth.
                    Create an EPIC, VIBRANT nature-inspired comic splash panel with:
                    - Thriving ecosystem (gardens, forests, flowers)
                    - ${prs.length} DISTINCT natural elements per update
                    - Dynamic energy (wind, rain, growth)
                    - Bold comic inks, natural colors (greens, purples, oranges - no neon)
                    - Celebratory, alive mood
                    Weave ALL ${prs.length} updates into ONE lush scene with clear visual count representation.`;

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
        temperature: 0.8,
        max_tokens: 1000,
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
async function getPRsAndCreatePrompt(githubToken) {
  try {
    const { prs, dateString } = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
    const promptData = await createMergedPrompt(prs, dateString);

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
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    console.error('❌ GitHub token required!');
    console.error('Usage: GITHUB_TOKEN=xxx node getPreviousDayPRs.js');
    console.error('   or: node getPreviousDayPRs.js <github_token> [pollinations_token]');
    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              TEST PR FETCHING                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const result = await getPRsAndCreatePrompt(githubToken);

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



testPRFetching().catch(console.error);
export { getMergedPRsFromPreviousDay, createMergedPrompt, getPRsAndCreatePrompt, getPreviousDayRange };