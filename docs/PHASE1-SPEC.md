# Phase 1 Build Spec — mediseller.com / .in

Status: **Approved (all recommendations accepted) · M1–M3 built** · v0.2 · 2026-11-01
Related: [`../PORTFOLIO.md`](../PORTFOLIO.md) (decisions log & site register)

`[PLACEHOLDER]` marks values waiting on client inputs. Section 15 collects every decision that needs a yes/no before build starts.

---

## 1. Goal

Launch mediseller.com as an **assisted-commerce** site. Visitors browse a pharma catalogue, build a cart and "check out" as in a normal online shop. Checkout produces a **qualified enquiry**, not a payment, and an agent closes the deal on WhatsApp, email or a call.

The codebase must also be the **shared engine** for every later site in the portfolio (Insulincart, Surgiseller, medisellers.com, …). Adding a new site should mean adding a config file and a catalogue, not writing new code.

### Success criteria
| Metric | Target |
|---|---|
| Every enquiry captured in Supabase **and** the Google Sheet | 100%, within 60 s |
| Cart → enquiry submit rate | Tracked from day 1 (baseline) |
| Agent reachable from any page | ≤ 1 tap (floating WhatsApp/chat) |
| Page speed (mobile, Lighthouse) | Performance ≥ 90, LCP < 2.5 s on 4G |
| Works on low-end Android / slow networks | Pages usable with 0 JS for browsing |
| Adding site #2 | Config + catalogue only, no engine changes |

---

## 2. Scope

**In Phase 1**
- Home, category listing, product pages, search
- Assisted cart + 3-step checkout with **4 closing actions** (WhatsApp / RFQ form / email quote / book a call)
- Optional prescription upload / camera capture
- Gemini chatbot: FAQs, lead capture, human handoff, multilingual replies
- Trust pages: About, Licences & certifications, Shipping countries, How ordering works, FAQ, Contact, Privacy, Terms, Medical disclaimer
- Leads → Supabase → Google Sheet; email alert to sales
- SEO (schema, sitemap, meta), GA4, Meta Pixel + Conversions API, cookie consent
- English UI, i18n-ready structure
- mediseller.in → 301 redirect to mediseller.com (see decision D1)

**Out of Phase 1 (planned later)**
- Other portfolio sites (same engine, Phase 2+)
- Online payments
- Customer accounts / order tracking
- Admin panel for editing products (Phase 1 edits via Google Sheet → rebuild)
- NeoDev CRM sync
- Additional UI languages (the bot is multilingual from day 1)
- OmniDimension AI auto-calling of hot leads

---

## 3. Architecture

```
          Visitor (browser)
               │
   ┌───────────▼───────────────┐
   │  Cloudflare Pages          │  Static pages built by Astro (fast, SEO)
   │  mediseller.com            │  + interactive "islands": cart, checkout, chat
   └───────────┬───────────────┘
               │  /api/*
   ┌───────────▼───────────────┐
   │  Cloudflare Pages Functions│  Server side; secrets live here only
   │  /api/lead   /api/chat     │
   │  /api/upload /api/capi     │
   └──┬────────┬────────┬──────┘
      │        │        │
 ┌────▼───┐ ┌──▼─────┐ ┌▼────────────┐
 │Supabase│ │ Gemini │ │ Meta CAPI,  │
 │Postgres│ │  API   │ │ Email (D3)  │
 │+Storage│ └────────┘ └─────────────┘
 └────┬───┘
      │ on insert (DB webhook → function)
 ┌────▼──────────────┐
 │ Google Sheet      │  "MediSeller Leads" (new, separate)
 │ (team view)       │
 └───────────────────┘
```

**Why this stack**
- **Astro**: outputs plain HTML, so it is very fast on slow networks in Africa and SE Asia, and great for SEO. Only the cart, checkout and chat ship JavaScript (as small Preact islands).
- **Cloudflare Pages + Functions**: free tier, global edge, preview URL for every branch, and it keeps the Gemini/Supabase keys off the browser.
- **Supabase**: Postgres + file storage for prescriptions, row-level security, easy later sync to NeoDev.
- **One repo, many sites**: each site is a folder of config + catalogue + brand assets. One build per site, each deployed as its own Cloudflare Pages project with its own domain. Sites look independent; the engine is shared.

---

## 4. Repository layout (new repo `mediseller-sites`)

```
mediseller-sites/
├── engine/                      # shared code (never site-specific)
│   ├── components/              # Header, ProductCard, CartDrawer, Checkout, ChatWidget…
│   ├── layouts/
│   ├── pages/                   # route templates used by every site
│   ├── functions/api/           # lead, chat, upload, capi
│   ├── lib/                     # supabase, gemini, whatsapp-link, analytics
│   └── styles/                  # design tokens, themed per site
├── sites/
│   └── mediseller/
│       ├── site.config.ts       # brand, domain, contacts, features, theme
│       ├── catalogue/products.csv
│       ├── content/             # About, FAQ, policies (Markdown)
│       └── public/              # logo, favicon, OG image, product images
├── supabase/migrations/         # SQL schema
├── scripts/                     # sheet→CSV import, image optimisation
└── docs/
```

Build command: `SITE=mediseller npm run build` → Cloudflare Pages project `mediseller` → mediseller.com.

### Site config (the knobs every site gets)
```ts
export default {
  id: 'mediseller',
  name: 'MediSeller',
  domain: 'mediseller.com',
  tagline: '[PLACEHOLDER]',
  theme: { primary: '[#hex]', accent: '[#hex]', font: 'Inter' },
  contact: {
    whatsapp: '[+91…]', phone: '[+91…]', email: '[sales@…]',
    address: '[PLACEHOLDER]', hours: 'Mon–Sat 9:00–20:00 IST',
  },
  legal: { company: '[PLACEHOLDER]', drugLicence: '[…]', iec: '[…]', gst: '[…]' },
  checkout: { whatsapp: true, rfq: true, email: true, call: true, rxUpload: 'optional' },
  pricing: 'hidden',                        // "Get best price" everywhere
  chatbot: { enabled: true, persona: 'MediSeller Assistant' },
  analytics: { ga4: '[G-…]', metaPixel: '[…]' },
  shippingCountries: ['[PLACEHOLDER list]'],
  locales: ['en'],
};
```

---

## 5. Sitemap

```
/                               Home
/products                       All products (filter + search)
/category/[slug]                ~20 categories
/product/[slug]                 Product detail
/cart                           Cart (also a slide-in drawer on every page)
/checkout                       3-step assisted checkout
/thank-you                      Confirmation + reference number
/how-to-order                   Process explained in 4 steps
/shipping                       Countries served, timelines, cold chain
/about                          Company, team, infrastructure
/licences                       DL, IEC, GST, WHO-GMP sourcing etc.
/for-business                   Importers, resellers, dropshippers, doctors
/faq
/contact
/privacy  /terms  /disclaimer
/sitemap.xml  /robots.txt
```

---

## 6. Page specifications

### 6.1 Global (every page)
- **Header:** logo · search · categories menu · "For Business" · cart icon with count · WhatsApp button.
- **Floating help dock (bottom-right):** chat bubble (Gemini bot) + WhatsApp icon. Hidden on the checkout step, where an inline "Need help?" is shown instead.
- **Trust strip** under the header: "Licensed Indian exporter · Ships to [N]+ countries · Genuine sourced products · Agent support 7 days".
- **Footer:** categories, company links, licence numbers, contact, disclaimer line.

### 6.2 Home
1. Hero: patient-first headline about getting medicines that are unavailable, expensive or slow in your country, with a search bar and two CTAs: **Find your medicine** / **Talk to an agent**.
2. "Who we help" cards: Patients · Importers & distributors · Doctors · Resellers & dropshippers.
3. Featured categories grid.
4. "How it works" in 4 steps: Search → Add to cart → Share requirement → Agent confirms quote & ships.
5. Featured / critical-care products.
6. Global reach: world map of shipping countries + stats `[PLACEHOLDER]`.
7. Trust: licences, sourcing, packaging, cold chain.
8. Testimonials `[PLACEHOLDER — need real ones; no fabricated reviews]`.
9. FAQ teaser + final CTA.

### 6.3 Category / listing
- Filters: category, dosage form, manufacturer, "Rx required", "Cold chain".
- Product card: image · brand name · generic/salt + strength · pack · manufacturer · `Rx` badge if applicable · **Get best price** (opens a quick-quote sheet) · **Add to cart**.

### 6.4 Product detail
- Gallery, brand name, **generic name / composition**, strength, dosage form, pack size, manufacturer, country of origin, storage.
- Quantity selector with unit (strips / boxes / vials / packs) and a "Bulk / B2B quantity" toggle that reveals MOQ notes.
- Buttons: **Add to cart** · **Get best price** · **Ask on WhatsApp** (pre-filled with the product name).
- Tabs: Overview · Uses (from approved product info only) · Storage & shipping · FAQ.
- "Prescription required" notice for Rx items (see §9).
- Related / alternative brands of the same salt.
- Sticky mobile bar: Add to cart + WhatsApp.

### 6.5 Cart
- Drawer + full page. Line items with quantity/unit editable, notes per item ("need urgently", "alternative brand ok").
- No prices; summary shows item count and **"Your agent will confirm the best price, availability and shipping."**
- CTA **Proceed to request quote** → checkout. Cart persists in the browser for 30 days.

### 6.6 Checkout (3 steps, e-commerce feel)
**Step 1 — Your details**
Name* · Country* (auto-detected, editable) · WhatsApp/phone* (country code auto-filled, validated) · Email · Buyer type* (Patient / Caregiver / Doctor / Pharmacy / Importer / Reseller / Other) · City · Company (shown for B2B types).

**Step 2 — Prescription (optional)**
Button **Upload or take a photo of your prescription**. Opens the camera on mobile and a file picker on desktop; JPG/PNG/PDF, ≤ 10 MB, up to 3 files. Shows a thumbnail preview. Skip link: "I'll share it with the agent later."

**Step 3 — How should we reach you?** (choose one, all four always available)
| Option | What happens |
|---|---|
| **Continue on WhatsApp** (default) | Saves the lead, then opens WhatsApp with a pre-filled message: reference no., items, quantities, country |
| **Request a quote** (form) | Saves the lead; agent replies by WhatsApp/email; confirmation email to buyer |
| **Email me the quote** | Saves the lead; sales gets the email; buyer gets a copy of their request |
| **Book a call** | Saves the lead + preferred date/time window & timezone (see D4) |

Consent checkbox* (privacy policy + contact permission). Submit → `/thank-you` with reference `MS-YYMMDD-XXXX`, the next steps, and a WhatsApp button.

**Every checkout step** shows an inline "Stuck? Chat with us / WhatsApp an agent" link.

### 6.7 Other enquiry entry points (all feed the same lead table)
- Quick "Get best price" sheet on cards (name, phone, country, qty).
- Contact page form.
- "For Business" form (company, country, products of interest, volumes).
- Chatbot lead capture.

---

## 7. Chatbot (Gemini)

| Item | Spec |
|---|---|
| Model | Current Gemini Flash-class model (fast, low cost); exact model ID fixed at build time |
| Where it runs | `/api/chat` Cloudflare Function; the key is never in the browser |
| Knowledge | Site catalogue (generated JSON) + FAQ + shipping + how-to-order content, supplied as context |
| Languages | Replies in the user's language (English, Russian, French, Arabic, Spanish, Bahasa, Vietnamese, Swahili…) |
| Tools the bot can call | `search_products`, `add_to_cart`, `capture_lead` (name, phone, country, product, qty), `handoff_to_agent` (opens WhatsApp with chat summary) |
| Handoff triggers | User asks for a human · price / availability / delivery-time questions · bot unsure · 2 failed answers · medical questions |
| Guardrails | No diagnosis, dosing or treatment advice ("please consult your doctor"); no prices or delivery promises; no claims beyond product info; escalates safety and side-effect questions to a human |
| Logging | Every session + messages stored in Supabase, linked to the lead |
| Abuse limits | Rate limit per IP, max message length, Cloudflare Turnstile on first message |

---

## 8. Data & lead pipeline

### 8.1 Supabase tables (Phase 1)
```
sites            id, name, domain
leads            id, ref_no, site_id, created_at, source (checkout|quick_quote|contact|business|chat),
                 contact_channel (whatsapp|rfq|email|call), name, phone_e164, email, country,
                 city, buyer_type, company, message, call_slot, call_tz, consent,
                 utm_source/medium/campaign, landing_page, referrer, status (new|contacted|quoted|won|lost),
                 assigned_to, sheet_synced_at
lead_items       id, lead_id, product_sku, product_name, qty, unit, note
attachments      id, lead_id, kind (prescription), storage_path, mime, size
chat_sessions    id, site_id, lead_id, started_at, language, handed_off
chat_messages    id, session_id, role, content, created_at
```
- Prescriptions are stored in a **private** Storage bucket and viewed only by signed links in the Sheet/email (expiring after 7 days, regenerable).
- Row-level security: the browser can't read or write tables directly; only the server functions (service role) can.

### 8.2 Flow
1. The browser posts to `/api/lead`, which validates, normalises the phone to E.164, and checks Turnstile.
2. Insert into Supabase, returning `ref_no`.
3. Fan-out (async, retried): **Google Sheet** row append · **sales email alert** · **Meta CAPI** `Lead` event.
4. Browser continues: WhatsApp deep-link / thank-you page.

### 8.3 Google Sheet ("MediSeller Leads", new)
One row per lead: Ref · Date (IST) · Site · Source · Channel · Name · Phone · Email · Country · Buyer type · Items (flattened) · Rx link · Message · Call slot · UTM · Status · Assigned to.
Status and Assigned-to are editable by the team (Phase 1 is one-way sync; a two-way sync is a later option).

---

## 9. Compliance & trust (for approval)

Some products are prescription medicines shipped across borders. To protect domains, ad accounts, hosting and the business:

1. **Prescription upload stays optional**, as decided. Rx items show: *"Prescription-only medicine. Our team will request a valid prescription before dispatch."* (see D2)
2. **No medical advice** anywhere (site or bot); a medical disclaimer appears in the footer and on product pages.
3. **Product info** is limited to factual, label-based data. No cure claims and no "no prescription needed" wording.
4. **Privacy:** consent checkbox; privacy policy covering India DPDP Act 2023 + GDPR basics; data retention; right to delete.
5. **Cookie consent banner** controls GA4 / Meta Pixel (required for EU visitors, good practice everywhere).
6. **Ads:** Meta/Google restrict promoting prescription drugs. Tracking is installed, but paid campaigns should target non-Rx / B2B / brand pages unless you hold the platform certifications.
7. **Brand names** (e.g. Benoquin) are used only as product identifiers, not as our branding.
8. Testimonials and stats must be real; placeholders stay hidden until supplied.

---

## 10. SEO & tracking

**SEO**
- One page per product and category with unique title/meta, generic + brand name in the H1/H2, and FAQ sections.
- Schema: `Organization`, `WebSite` + SearchAction, `Product` (without price), `BreadcrumbList`, `FAQPage`.
- Note: Google gives price-less products limited rich results, which is accepted given the "Get best price" model.
- `sitemap.xml`, `robots.txt`, canonical URLs, Open Graph images, hreflang-ready.
- Content hooks for later: "Buy [generic] in [country]" landing pages (Phase 2 SEO).

**Analytics events (GA4 + Meta Pixel/CAPI, deduplicated via event_id)**
| Event | GA4 | Meta |
|---|---|---|
| Product viewed | `view_item` | `ViewContent` |
| Added to cart | `add_to_cart` | `AddToCart` |
| Checkout started | `begin_checkout` | `InitiateCheckout` |
| Rx uploaded | `rx_upload` | custom |
| Lead submitted | `generate_lead` (channel param) | `Lead` (server + browser) |
| WhatsApp clicked | `whatsapp_click` | `Contact` |
| Chat started / handoff | `chat_start` / `chat_handoff` | custom |

UTM parameters are captured on landing and stored with the lead.

---

## 11. Design direction

A blend of the three agreed directions:
- **Clinical trust:** white space, calm blue/teal tokens derived from the MediSeller brand colours `[PLACEHOLDER]`, licence badges near CTAs.
- **E-commerce browsing:** product cards, filters, sticky cart, badges (`Rx`, `Cold chain`, `Bulk available`).
- **Premium exporter:** world-map section, logistics visuals, B2B page with volumes and documentation.
- **Mobile-first:** most traffic will be mobile on mid/low-end Android. Large tap targets, sticky WhatsApp, light images (AVIF/WebP).
- **Accessibility:** WCAG 2.1 AA contrast, keyboard navigation, form labels.
- **Theming:** each future site re-skins via `theme` in its config (colours, font, logo, imagery), so sites look independent.

---

## 12. Catalogue

- **Source of truth (Phase 1):** a Google Sheet "MediSeller Catalogue". A script imports it to `products.csv`, which triggers a rebuild.
- Columns: `sku, name, generic, strength, form, pack, unit, manufacturer, category, rx (Y/N), cold_chain (Y/N), moq, image, short_desc, uses, storage, status (live/hidden), sites (mediseller;insulincart…)`.
- The `sites` column lets one master catalogue feed every future site.
- Initial load merges the client sheet + the existing ~20-category / 100+ product catalogue + IndiaMart listings, then de-duplicates. Placeholders are used until received.

---

## 13. Quality checks before each preview
- Lighthouse mobile ≥ 90 performance / ≥ 95 accessibility / 100 SEO on Home, Category, Product.
- End-to-end test (Playwright): browse → cart → checkout for each of the 4 channels → row appears in Supabase + Sheet.
- Rx upload on Android Chrome camera + desktop.
- Bot tests: FAQ answer, lead capture, handoff, refusal of a dosing question, reply in Russian & French.
- Forms tested with intl numbers from priority countries (NG, KE, RU, VN, ID, PH, UZ, …).

---

## 14. Milestones (a preview link at each)

| # | Milestone | Deliverable | Preview |
|---|---|---|---|
| M0 | Spec approved | This document signed off | — |
| M1 | Foundation | New repo, engine skeleton, site config, design tokens, Home + listing + product pages with placeholder catalogue | `*.pages.dev` link |
| M2 | Assisted cart & checkout | Cart, 3-step checkout, 4 channels, Rx upload, Supabase + Sheet + email | Preview + test Sheet |
| M3 | Chatbot | Gemini bot with tools, handoff, logging | Preview |
| M4 | Content & trust | Real catalogue, brand assets, trust/legal pages, testimonials | Preview |
| M5 | SEO, tracking, launch | Schema, sitemap, GA4, Pixel + CAPI, consent, QA, DNS cut-over for mediseller.com/.in | Live |

M1 can start as soon as the repo exists, with placeholders. M2 needs Supabase; M3 needs the Gemini key; M5 needs Cloudflare/DNS access.

---

## 15. Decisions (all approved 2026-11-01 — client: "you do all tasks")

| ID | Decision | Approved |
|---|---|---|
| D1 | mediseller.in: redirect to .com, or a separate India-focused site? | 301 redirect to .com in Phase 1 |
| D2 | Rx wording: "Our team will request a valid prescription before dispatch" for Rx items | Approve (upload still optional) |
| D3 | Email sending service for alerts and buyer copies | Resend (free tier, simple) |
| D4 | "Book a call": simple preferred-slot form, or Cal.com scheduling with real availability? | Slot-request form in Phase 1 |
| D5 | Catalogue editing via Google Sheet → rebuild (no admin panel in Phase 1) | Approve |
| D6 | Sheet sync one-way (Supabase → Sheet) in Phase 1 | Approve |
| D7 | Bot persona name & tone (e.g. "MediSeller Assistant", warm and professional) | Approve or rename |
| D8 | Cookie consent banner gating GA4/Pixel | Approve |
| D9 | Lead reference format `MS-YYMMDD-XXXX` (prefix per site later, e.g. `IC-` for Insulincart) | Approve |
| D10 | WhatsApp: one sales number for all sites, or a separate number per site? | Separate per site once sites multiply; one for Phase 1 |

---

## 15b. Build notes (deviations from v0.1)

- **Client islands are plain JavaScript** (no Preact). This is smaller and faster (≈29 KB of JS in total) with the same behaviour.
- **Google Sheet sync** goes through an Apps Script web-app webhook called directly by `/api/lead` (with `sheet_synced_at` tracking and `/api/admin/resync`), not a Supabase DB webhook. It is simpler to set up and needs no Google service account.
- **Code lives in `mediseller-sites/`** in this repo for now, because this session cannot create new GitHub repos. It is self-contained and can be split into its own repo with one command (see its README).
- **Catalogue:** 104 products from the Mediseller-2.0 seed. Controlled substances, withdrawn drugs and duplicates were excluded; see `mediseller-sites/docs/CATALOGUE-NOTES.md`.

## 16. Inputs needed (from `PORTFOLIO.md`)
1. New GitHub repo `mediseller-sites` + Claude GitHub app access, **needed for M1**
2. Logo files + brand colour codes
3. Company details: legal name, address, DL / IEC / GST, phone, WhatsApp, sales email
4. Product data: Excel/sheet, existing catalogue location, IndiaMart storefront URL
5. Supabase project (URL + anon key; service key goes in Cloudflare secrets), **needed for M2**
6. Gemini API key (into Cloudflare secrets), **needed for M3**
7. Google account for the new leads Sheet (share with a service account)
8. Cloudflare account + where DNS for mediseller.com/.in is managed, **needed for M5**
9. GA4 ID, Meta Pixel ID + CAPI token (if they exist)
10. Shipping-countries list, real testimonials and stats
