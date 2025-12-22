import { Devvit, RunAs } from '@devvit/public-api';
import LINK from './link.ts';


Devvit.addMenuItem({
  label: 'Post Pollinations Image',
  location: 'subreddit',
  onPress: async (_, context) => {
    const externalUrl = LINK;

    try {

      const imageAsset = await context.media.upload({
        url: externalUrl,
        type: 'image',
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      await context.reddit.submitPost({
        subredditName: context.subredditName ?? 'pollinations_ai',
        title: 'Pollinations AI – Generated Visual',
        kind: 'image',
        imageUrls: [imageAsset.mediaUrl],
      });

      context.ui.showToast('Image posted successfully!');
    } catch (error) {
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
