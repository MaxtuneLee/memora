// iPadOS Safari reports a Mac user agent, so a touch-capable "Mac" counts as a tablet.
export const isMobileDevice = (userAgent: string, maxTouchPoints: number): boolean =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
  (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
