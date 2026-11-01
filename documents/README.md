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

## Building the PDFs

```
node documents/build-pdf.js --png
```

## Document codes

| Prefix | Category | Accent colour |
|---|---|---|
| `MS-POL` | Office rules and policies | Brand Red |
| `MS-PL` | Price lists and rate cards | Clinical Blue |
| `MS-INC` | Incentives and commission | Primary Navy |
| `MS-SOP` | Procedures and schedules (Common / Domestic / Global / Activation) | Clinical Blue |
| `MS-REF` | Reference guides (lead stages, keyword list, hashtags, labels) | Medical Black |

## Register

| Code | Title | Version | Effective | Status |
|---|---|---|---|---|
| MS-POL-01 | Office Rules: Phone Usage Policy | 1.0 | 01 Nov 2026 | Template sample, awaiting approval |
