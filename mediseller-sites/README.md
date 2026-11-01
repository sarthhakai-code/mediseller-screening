# mediseller-sites

One engine for the whole MediSeller family of **assisted-commerce** websites. Visitors browse a catalogue, build a cart and "check out", but checkout creates a **qualified enquiry** instead of a payment. An agent then closes the deal on WhatsApp, email or a call.

Phase 1 site: **mediseller.com** (`sites/mediseller/`). Spec: [`../docs/PHASE1-SPEC.md`](../docs/PHASE1-SPEC.md).

> This folder is self-contained so it can be moved into its own repository (`mediseller-sites`) at any time:
> `git subtree split -P mediseller-sites -b mediseller-sites` and push that branch to the new repo.

## How it fits together

```
Browser ──► Cloudflare Pages (static HTML built by Astro)
   │            /api/lead   /api/chat   /api/geo   /api/admin/resync   (Cloudflare Functions)
   │                 │            │
   │                 ├──► Supabase (leads, items, prescriptions, chat logs)
   │                 ├──► Google Sheet "MediSeller Leads" (Apps Script webhook)
   │                 ├──► Resend (sales alert + buyer copy)
   │                 ├──► Meta Conversions API
   │                 └──► Gemini (chat assistant, with tools)
   └──► WhatsApp deep-link with the cart + reference number pre-filled
```

* **No backend configured?** The site still works: checkout falls back to sending the full request on WhatsApp or by email, so no lead is lost.
* All secrets live in Cloudflare environment variables. The browser never sees them.

## Folder map

| Path | What it is |
|---|---|
| `src/` | Shared engine: pages, layout, components, client scripts, styles |
| `functions/api/` | Cloudflare Pages Functions (server side) |
| `server/` | Server logic shared by the functions (validation, Supabase, Sheet, email, Gemini) |
| `sites/<id>/site.config.mjs` | **Everything brand-specific**: name, domain, colours, contacts, licences, shipping countries, analytics IDs |
| `sites/<id>/catalogue/products.csv` | The catalogue (one row per product) |
| `sites/<id>/content/*.md` | About, privacy, terms, disclaimer pages |
| `sites/<id>/public/` | Logo, favicon, OG image, product images, `_headers`, `_redirects` |
| `supabase/migrations/` | Database schema |
| `integrations/google-sheet/Code.gs` | Apps Script that receives leads into the Google Sheet |
| `tests/` | Unit tests (`node --test`) + end-to-end browser test |

## Local development

```bash
npm install
SITE=mediseller npm run dev          # http://localhost:4321 (pages only)
SITE=mediseller npm run build
npm run preview                      # pages + functions on http://localhost:8788 (uses .dev.vars)
npm run test:server                  # unit tests
npm run test:e2e                     # full browser test against mocked Supabase/Sheet/Gemini
```

Copy `.dev.vars.example` to `.dev.vars` to try the real services locally.

## Going live (one-time setup, about 30 minutes)

### 1. Supabase
1. Create a project, then open **SQL editor**, paste `supabase/migrations/0001_init.sql` and run it.
2. Copy the **Project URL** and the **service_role** key from Settings → API. The service key goes only into Cloudflare, never into the code.

### 2. Google Sheet
Follow the steps at the top of `integrations/google-sheet/Code.gs`. You get a web-app URL and a token.

### 3. Email (Resend), decision D3
Create an account and verify the `mediseller.com` domain (DNS records). Create an API key.

### 4. Gemini
Create an API key in Google AI Studio.

### 5. Cloudflare Pages
**Workers & Pages → Create → Pages → Connect to Git**, then select this repo.

| Setting | Value |
|---|---|
| Production branch | `main` (or the branch you choose) |
| Root directory | `mediseller-sites` |
| Build command | `npm run build` |
| Build output | `dist` |
| Env var (build) | `SITE=mediseller` |

Add these **environment variables** (mark secrets as *Encrypted*):

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | yes | Supabase service-role key (secret) |
| `SHEET_WEBHOOK_URL` / `SHEET_WEBHOOK_TOKEN` | yes | Google Sheet receiver |
| `RESEND_API_KEY` | recommended | Email alerts |
| `EMAIL_FROM` | with Resend | e.g. `MediSeller <quotes@mediseller.com>` |
| `SALES_EMAIL` | optional | Where alerts go (defaults to `contact.email` in the site config) |
| `GEMINI_API_KEY` | for chatbot | Without it, the bot uses keyword search + WhatsApp handoff |
| `GEMINI_MODEL` | optional | Defaults to `gemini-2.5-flash`; set it to the current Flash model |
| `META_PIXEL_ID` / `META_CAPI_TOKEN` | optional | Server-side Lead events |
| `TURNSTILE_SECRET` | optional | Bot protection (also set `turnstileSiteKey` in the site config) |
| `ADMIN_TOKEN` | optional | Protects `POST /api/admin/resync` (re-pushes unsynced leads to the Sheet) |

Under Settings → Functions, set the **compatibility date** to `2025-09-01` or later.

Every branch push then gets its own **preview URL** (`<branch>.<project>.pages.dev`).

### 6. Domains
* In the Pages project, add the custom domains `mediseller.com` and `www.mediseller.com`.
* **mediseller.in → mediseller.com** (decision D1): add the `.in` zone to Cloudflare and create a *Redirect Rule*, "All incoming requests" → dynamic `concat("https://mediseller.com", http.request.uri.path)`, 301, preserve query string.

### 7. Recommended Cloudflare protections
* WAF → Rate limiting rule: `/api/*`, 30 requests / minute / IP.
* Turnstile on checkout if spam appears.

## Adding the next site (e.g. Insulincart)

1. `cp -r sites/mediseller sites/insulincart`
2. Edit `sites/insulincart/site.config.mjs`: `id`, `name`, `domain`, `refPrefix` (e.g. `IC`), theme colours, contacts, nav.
3. Replace the catalogue (or filter the master catalogue with the `sites` column), the content pages and the logo.
4. Insert the site into Supabase: `insert into sites (id,name,domain) values ('insulincart','Insulincart','insulincart.com');`
5. Create a new Cloudflare Pages project from the same repo with `SITE=insulincart`.

No engine code changes are needed. Every site shares the same lead pipeline, Google Sheet (with a "Site" column) and chatbot engine.

## Editing the catalogue (decision D5)

Edit `sites/mediseller/catalogue/products.csv` (or export it from the "MediSeller Catalogue" Google Sheet) and push. Cloudflare rebuilds in about a minute.

Columns: `sku, slug, name, generic, strength, form, pack, unit, manufacturer, reference_brand, category, rx, cold_chain, moq, image, short_desc, storage, featured, status, sites, verified`

* `status=hidden` removes a product without deleting it.
* `verified=N` shows a "being verified" note on the product page. Set it to `Y` once the pharmacist team has checked the row.
* `image` is a path such as `/products/imatinib.webp` (put the file in `sites/<id>/public/products/`).

See [`docs/CATALOGUE-NOTES.md`](docs/CATALOGUE-NOTES.md) for how the initial catalogue was built and what was excluded.
