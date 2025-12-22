import { Devvit, RunAs } from '@devvit/public-api';
import LINK from './link.ts';
import { getMergedPRsFromPreviousDay, getPRsAndCreatePrompt, generateImage, generateTitleFromPRs } from './pipeline.ts';
import dotenv from 'dotenv';
dotenv.config();


Devvit.addMenuItem({
  label: 'Post Pollinations Image',
  location: 'subreddit',
  onPress: async (_, context) => {
    

    try {
      const githubToken = process.env.GITHUB_TOKEN || '';
      const promptData = await getPRsAndCreatePrompt(githubToken);
      const imageData = await generateImage(promptData.prompt);
      const title = await generateTitleFromPRs(promptData.summary, String(promptData.prCount));

      const imageAsset = await context.media.upload({
      url: imageData.url,
      type: 'image',
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      await context.reddit.submitPost({
      subredditName: context.subredditName ?? 'pollinations_ai',
      title: title,
      kind: 'image',
      imageUrls: [imageAsset.mediaUrl],
      });

      context.ui.showToast('Image posted successfully!');
    }
    
    catch (error) {
      if (error instanceof Error && error.message.includes('is being created asynchronously')) {
        context.ui.showToast('Image posted! Processing on Reddit...');
      } else {
        console.error('Upload failed:', error);
        context.ui.showToast('Failed to upload image to Reddit.');
      }
    }
  },
});

export default Devvit;
