// Loads the active site's catalogue (sites/<SITE>/catalogue/products.csv) at build time.
import csvText from '@site/catalogue/products.csv?raw';
import site from '@site/site.config.mjs';

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const yes = (v) => /^(y|yes|true|1)$/i.test(v || '');

export const products = parseCSV(csvText)
  .filter((p) => p.status !== 'hidden')
  .filter((p) => !p.sites || p.sites.split(/[;|]/).map((s) => s.trim()).includes(site.id))
  .map((p) => ({
    ...p,
    rx: yes(p.rx),
    coldChain: yes(p.cold_chain),
    featured: yes(p.featured),
    verified: yes(p.verified),
    categorySlug: slugify(p.category),
    url: `/product/${p.slug}/`,
  }));

export const categories = [...new Set(products.map((p) => p.category))].map((name) => ({
  name,
  slug: slugify(name),
  count: products.filter((p) => p.category === name).length,
  url: `/category/${slugify(name)}/`,
}));

export const forms = [...new Set(products.map((p) => p.form))].filter(Boolean);

// Compact JSON for client-side search, cart and the chatbot (served at /catalogue.json)
export const publicCatalogue = products.map((p) => ({
  sku: p.sku, slug: p.slug, name: p.name, generic: p.generic, strength: p.strength, form: p.form,
  unit: p.unit, category: p.category, ref: p.reference_brand, rx: p.rx, cold: p.coldChain,
  desc: p.short_desc, url: p.url,
}));
