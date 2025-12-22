export async function postImageToSubreddit(
  context,
  subredditName,
  title,
  imageArrayBuffer
) {
  // Upload image to Reddit (binary, not URL)
  const upload = await context.reddit.uploadMedia({
    subredditName,
    mimeType: 'image/png',
    data: imageArrayBuffer, // ArrayBuffer or Uint8Array
  });

  if (!upload || !upload.mediaId) {
    throw new Error('Reddit image upload failed');
  }

  // Submit image post
  const post = await context.reddit.submitPost({
    subredditName,
    title,
    mediaId: upload.mediaId,
  });

  return post;
}
