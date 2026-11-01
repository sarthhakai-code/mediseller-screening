import site from '../lib/site.js';
export const GET = () => new Response(`User-agent: *\nAllow: /\nDisallow: /checkout/\nDisallow: /cart/\nDisallow: /thank-you/\nDisallow: /api/\n\nSitemap: https://${site.domain}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
