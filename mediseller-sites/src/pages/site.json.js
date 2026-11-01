// Public (non-secret) site config consumed by Cloudflare Functions. Never put secrets in site.config.mjs.
import site from '../lib/site.js';
const { id, name, domain, refPrefix, contact, checkout, chatbot, shippingRegions } = site;
export const GET = () => new Response(JSON.stringify({ id, name, domain, refPrefix, contact, checkout, chatbot, shippingRegions }), { headers: { 'content-type': 'application/json' } });
