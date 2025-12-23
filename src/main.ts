import { Devvit, SettingScope } from '@devvit/public-api';
import {getPRsAndCreatePrompt, generateImage, generateTitleFromPRs } from './pipeline.ts';

Devvit.configure({
  http: {
    domains: ['https://gen.pollinations.ai', 'https://api.github.com'],
  },
});


Devvit.addSettings([
  {
    type: 'string',
    name: 'gh_token',
    label: 'GitHub Token',
    isSecret: true,
    scope: SettingScope.App, 
  },
  {
    type: 'string',
    name: 'p_key',
    label: 'Polli Key',
    isSecret: true,
    scope: SettingScope.App,
  },
])

Devvit.addMenuItem({
  label: 'Post Pollinations Image',
  location: 'subreddit',
  onPress: async (_, context) => {
    try {
      const githubToken = await context.settings.get('gh_token');
      const pollinationsToken = await context.settings.get('p_key');
      
      if (!githubToken) {
        throw new Error('GitHub token not configured. Please set it in app settings.');
      }
      if (!pollinationsToken) {
        throw new Error('Pollinations token not configured. Please set it in app settings.');
      }
      
      const promptData = await getPRsAndCreatePrompt(githubToken as string, pollinationsToken as string);
      const imageData = await generateImage(promptData.prompt, pollinationsToken as string);
      const title = await generateTitleFromPRs(promptData.summary, String(promptData.prCount), pollinationsToken as string);

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
