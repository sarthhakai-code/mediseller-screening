import site from '../lib/site.js';
import { products, categories } from '../lib/catalogue.js';
export const GET = () => {
  const pages = import.meta.glob('@site/content/*.md');
  const content = Object.keys(pages).map((p) => `/${p.split('/').pop().replace(/\.md$/, '')}/`);
  const urls = ['/', '/products/', '/how-to-order/', '/for-business/', '/shipping/', '/licences/', '/faq/', '/contact/', ...content,
    ...categories.map((c) => c.url), ...products.map((p) => p.url)];
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>https://${site.domain}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
};
