# MEDISELLER — Internal Document System

These are the redesigned notice-board and team documents. They follow MEDISELLER Brand Standard V1.0: the six-colour palette, Inter for English and Noto Sans Devanagari for Hindi.

## Structure

| Folder | Contents |
|---|---|
| `assets/mediseller-docs.css` | Shared template: header, document-control strip, footer, components |
| `assets/fonts/` | Bundled web fonts (SIL Open Font License), so PDFs render offline |
| `assets/logo/` | **Pending:** approved master logo files go here |
| `policies/` etc. | Editable HTML source, one file per document |
| `pdf/` | Print-ready A4 PDFs plus PNG previews (generated) |

## Updating and building

The data for every document except MS-POL-01 is held in `tools/generate_docs.py`. To change a price, task or row:

```
python3 documents/tools/generate_docs.py   # regenerates the HTML
node documents/build-pdf.js --png          # rebuilds the PDFs and previews
```

Edit the data in the generator, not the generated HTML: the next regeneration overwrites changes made directly to the HTML. MS-POL-01 is hand-written HTML.

## Document codes

| Prefix | Category | Accent colour |
|---|---|---|
| `MS-POL` | Office rules and policies | Brand Red |
| `MS-PL` | Price lists and rate cards | Clinical Blue |
| `MS-INC` | Incentives and commission | Primary Navy |
| `MS-SOP` | Procedures and schedules (Common / Domestic / Global / Activation) | Clinical Blue |
| `MS-REF` | Reference guides (lead stages, keyword list, hashtags, labels) | Medical Black |

## Register

| Code | Title | Pages | Effective | Status |
|---|---|---|---|---|
| MS-POL-01 | Office Rules: Phone Usage Policy | 1 | 01 Nov 2026 | Approved template |
| MS-PL-01 | ED Product Catalogue (₹5/strip scheme) | 2 | 01 Nov 2026 | Draft, items marked [confirm] |
| MS-PL-02 | Aramex International Shipping Rate Card | 1 | 29 Aug 2026 (valid until 29 Nov 2026) | Draft |
| MS-INC-01 | Sales Agent Incentive Scheme | 2 | 01 Nov 2026 | Draft, Gold tier basis to confirm |
| MS-SOP-01 | Daily Sales Operations: Master SOP | 5 | 01 Nov 2026 | Draft, timings need sign-off |
| MS-SOP-02 | Common Tasks: All Staff (checklist) | 2 | 01 Nov 2026 | Draft |
| MS-SOP-03 | Domestic Sales Tasks (checklist) | 1 | 01 Nov 2026 | Draft |
| MS-SOP-04 | Global Sales Tasks (checklist) | 1 | 01 Nov 2026 | Draft |
| MS-SOP-05 | Activation Team Tasks (checklist) | 1 | 01 Nov 2026 | Draft |
| MS-REF-01 | Lead Stages and Follow-up Guide | 2 | 01 Nov 2026 | Draft |
| MS-REF-02 | Keyword-Call Product List | 2 | 01 Nov 2026 | Draft |
| MS-REF-03 | Social Media Hashtag Library | 1 | 01 Nov 2026 | Draft |
| MS-REF-04 | Contacts and Devices | 1 | 01 Nov 2026 | Draft, number roles to fill in |

Not reproduced from the originals: anabolic steroid, HGH and clenbuterol products (the Magnum and Phoenix price list, the related keyword-list and incentive rows, the steroid outreach tasks and the steroid hashtag row).
