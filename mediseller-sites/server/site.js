// Functions are site-agnostic: they read the built site's public config & catalogue from static assets.
let cache = {};
async function asset(context, path) {
  if (cache[path]) return cache[path];
  const url = new URL(path, context.request.url);
  const res = context.env.ASSETS ? await context.env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`asset ${path} → ${res.status}`);
  return (cache[path] = await res.json());
}
export const getSite = (context) => asset(context, '/site.json');
export const getCatalogue = (context) => asset(context, '/catalogue.json');
export const _resetCache = () => (cache = {});
