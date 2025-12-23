
// import { Devvit } from '@devvit/public-api';
// Devvit.addMenuItem({
//   label: 'Post Pollinations Image',
//   location: 'subreddit',
//   onPress: async (_, context) => {
//     try {
     

//       const imageAsset = await context.media.upload({
//       url: LINK,
//       type: 'image',
//       });

//       await new Promise((resolve) => setTimeout(resolve, 5000));
//       await context.reddit.submitPost({
//       subredditName: context.subredditName ?? 'pollinations_ai',
//       runAs: "USER",
//       title: TITLE,
//       kind: 'image',
//       imageUrls: [imageAsset.mediaUrl],
//       });

//       context.ui.showToast('Image posted successfully!');
//     }
    
//     catch (error) {
//       if (error instanceof Error && error.message.includes('is being created asynchronously')) {
//         context.ui.showToast('Image posted! Processing on Reddit...');
//       } else {
//         console.error('Upload failed:', error);
//         context.ui.showToast('Failed to upload image to Reddit.');
//       }
//     }
//   },
// });

// export default Devvit;