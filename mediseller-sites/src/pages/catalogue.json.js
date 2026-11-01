import { publicCatalogue } from '../lib/catalogue.js';
export const GET = () => new Response(JSON.stringify(publicCatalogue), { headers: { 'content-type': 'application/json' } });
