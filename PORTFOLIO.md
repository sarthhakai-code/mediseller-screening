# MediSeller Multi-Site Portfolio — Working Log

Status: **Phase 1 spec drafted** — see [`docs/PHASE1-SPEC.md`](docs/PHASE1-SPEC.md), awaiting approval
Source: handwritten list shared 2026-11-01. Readings marked `?` need confirmation.

## Project agenda (as understood so far)

Build and run a family of websites:

1. **MediSeller master site** — the flagship brand hub.
2. **Category sites** — one site per product vertical (e.g. surgical, ayurveda, insulin, weight-loss).
3. **Country sites** — market-specific sites (e.g. Georgia).
4. **Other brands / ventures / clients** — sites for sister businesses and paying customers.
5. **Marketplace presence** — B2B listings (IndiaMart, TradeIndia, Exporters India) feeding leads back to MediSeller.

## Site / channel register

| # | Name (as written) | Likely domain / form | Probable type | Open points |
|---|---|---|---|---|
| 1 | mediseller.com / .in | mediseller.com, mediseller.in | Master brand site | Which is primary? .com global, .in India? |
| 2 | cart69.com / .in | cart69.com, cart69.in | Separate store brand | What does it sell? Audience? |
| 3 | testostore | testostore.? | Category store (men's health / TRT?) | Looks struck through on the page — dropped or active? |
| 4 | Leankart | leankart.? | Category store (weight loss?) | Domain owned? |
| 5 | Insulincart | insulincart.? | Category store (diabetes / insulin) | Cold-chain shipping scope? |
| 6 | Digital chemist | ? | Online pharmacy / category | Exact name & domain |
| 7 | Benoquin creams | ? | Single-product site (monobenzone cream) | Brand-name use rights |
| 8 | Bangen Georgia `?` | ? | Country site — Georgia | Correct spelling? Georgia the country or US state? |
| 9 | IndiaMart (medisellers.com) | IndiaMart listing; medisellers.com | Marketplace channel | Is medisellers.com a separate site or just the listing's linked domain? |
| 10 | TradeIndia | listing | Marketplace channel | Existing account? |
| 11 | Exporters India | listing | Marketplace channel | Existing account? |
| 12 | Sustain go `?` | ? | Other venture | "go" looks crossed out — Sustain / Sustaingo? What is it? |
| 13 | Surgiseller | surgiseller.? | Category site — surgical | Domain owned? |
| 14 | Ayurseller `?` | ayurseller.? | Category site — ayurveda | Spelling confirm |
| 15 | Largexx `?` | ? | Other brand | Spelling & what it is |
| 16 | Kaal | ? | Other brand / client | What it is |
| 17 | aiseller | aiseller.? | Other venture (AI services?) | What it is |
| 18–20 | (blank) | — | — | Reserved for additions |

## Decisions log (planning rounds 1–6, 2026-11-01)

### Business & audience
- **Sales model:** hybrid, *assisted commerce*. Users get an e-commerce-style browse → product card → cart → checkout experience, but no online payment. Every deal closes through a person on email, chat, WhatsApp or a call.
- **Help everywhere:** every site has CTAs to reach an agent wherever the user gets stuck, plus a chatbot.
- **Audience (B2B + B2C, global):**
  - Patients who need medicines for personal use that are unavailable, very expensive, or slow to obtain in their country.
  - Importers, resellers, doctors, online sellers and dropshippers of Indian pharma / healthcare / wellness products.
- **Priority markets:** countries where insurance doesn't cover critical-care drugs, mainly SE Asia, Africa, the rest of Asia, Russia/CIS and parts of Eastern Europe.

### Site architecture
- **Sites look fully independent:** each has its own brand and domain, and none visibly links to MediSeller.
- **One shared back end:** one codebase with per-site config, one lead pipeline, one chatbot engine and one admin.
- testostore and "Sustain go" are **both active** (not struck through).
- #9 **medisellers.com** is the site the IndiaMart listing links to, so it needs to be built.

### Checkout & cart
- The checkout end offers **all four** actions: send cart to WhatsApp, submit an RFQ form, email a quote request, book an agent call.
- **Prescription:** an optional button before checkout lets the user upload a prescription or take a photo of it. It is **not mandatory**.
- **Pricing:** no prices shown; every product has a **"Get best price"** button.

### Chatbot
- Engine: **Gemini API**.
- Capabilities: product FAQs, lead capture, handoff to a human, multilingual replies.

### Leads & data
- **Supabase** is the system of record (leads, carts, RFQs, chats, call bookings). Prescription images go to Supabase Storage.
- New leads are copied automatically to a **new, separate Google Sheet**, not any existing one.
- **NeoDev CRM** sync comes later via its API.

### Catalogue
- Sources (combined): Excel/sheet from the client + the existing ~20-category / 100+ product catalogue + the IndiaMart storefront. Placeholders are used until the real data arrives.

### Design
- A blend of all directions: clinical trust + modern e-commerce browsing + premium global-exporter feel.

### Tech & delivery
- Stack: Claude's choice. Plan: shared Astro/Next.js codebase with per-site config.
- **Code lives in a new dedicated repo** (e.g. `mediseller-sites`). This repo stays the Compass form.
- **Hosting:** Cloudflare Pages.
- **Review process:** a build spec for approval first, then a preview link at each milestone.

### Phase 1 = mediseller.com / .in
- Launch language: **English** only, with i18n-ready structure.
- MVP scope: catalogue + assisted cart + RFQ + Rx upload; Gemini chatbot; trust pages (about, licences, shipping countries, how ordering works, FAQ, contact, privacy, terms); SEO (schema, sitemap) + GA4 + Meta Pixel/CAPI.
- Client already has: **domains owned**, **logo and brand colours**, **company details** (licences, address, contacts).
- Sites #2–8 and #12–17: details deferred until after the master site.

## Inputs needed from client before / during Phase 1 build
1. New GitHub repo created (e.g. `mediseller-sites`) and the Claude GitHub app given access.
2. Logo files + brand colour codes.
3. Company details: legal name, address, licence numbers (DL / IEC / GST), phone, WhatsApp number, sales email.
4. Product data: the Excel/sheet, the location of the existing catalogue, and the IndiaMart storefront URL.
5. Supabase project (URL + anon key; service key goes into Cloudflare secrets, not chat).
6. Gemini API key (into Cloudflare secrets).
7. Google account / Sheet for the lead copy.
8. Cloudflare account access, and where DNS for mediseller.com / .in is managed.
9. GA4 ID and Meta Pixel ID (if they exist).
10. Shipping-countries list to display.
