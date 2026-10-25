const value = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!value) throw new Error('Web builds require EXPO_PUBLIC_CONVEX_URL (public backend URL).');
const url = new URL(value);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
  throw new Error('Use an HTTPS Convex URL without credentials or query parameters.');
}
