import dotenv from 'dotenv';
dotenv.config();

const POLLINATIONS_API = 'https://gen.pollinations.ai/v1/chat/completions';
const TARGET_SUBREDDIT = 'pollinations_ai';

async function generateTitleFromImage(imageDescription) {
  try {
    const systemPrompt = `Generate a SHORT reddit post title (max 10 words). Use natural language, no metrics or dates.`;
    const userPrompt = `Comic about: ${imageDescription}\nShort title only.`;

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
        max_tokens: 50,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Pollinations Update';
  } catch (error) {
    console.error('Title generation failed:', error.message);
    return 'Pollinations Daily Update';
  }
}

async function postImageToReddit(context, imagePath, imageDescription) {
  try {
    const subreddit = await context.reddit.getSubredditById(`t5_placeholder_${TARGET_SUBREDDIT}`);
    
    const title = await generateTitleFromImage(imageDescription);

    const post = await subreddit.submitImage({
      title,
      imagePath,
      preview: imageDescription,
    });

    console.log(`✓ Posted: ${title}`);
    console.log(`URL: ${post.permalink}`);
    
    return post;
  } catch (error) {
    console.error('❌ Failed to post:', error.message);
    throw error;
  }
}

// Example usage
const testImageUrl = 'https://image.pollinations.ai/prompt/abstract%20colorful%20art';
const testImageDesc = 'Abstract colorful digital art with vibrant gradients';

(async () => {
  try {
    const title = await generateTitleFromImage(testImageDesc);
    console.log('Generated title:', title);
  } catch (error) {
    console.error('Test failed:', error);
  }
})();
export { postImageToReddit, TARGET_SUBREDDIT };
