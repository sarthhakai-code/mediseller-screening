# Catalogue notes: initial load (2026-11-01)

**Source:** the seed data in the private repo `Mediseller-2.0` (`backend/server.py`, 120 products, 6 categories).
**Script:** `scripts/seed_from_mediseller2.py` → `sites/mediseller/catalogue/products.csv` (**104 products**).

## What was changed
| Change | Why |
|---|---|
| Prices, "original price" and discount % **removed** | Pricing is hidden; every product shows "Get best price". The seed prices were placeholders. |
| Originator brands listed under the **generic name**, with the originator kept as "Reference brand" (e.g. *Imatinib Mesylate 400 mg*, ref. Gleevec (Novartis)) | MediSeller supplies Indian brands and generics. Keeping the originator only as a reference avoids implying we sell the originator pack and avoids trademark problems, while still matching searches for the brand name. |
| Indian brands keep their brand name (Hepcinat Plus, Tenvir-EM, Tadacip…) | They are the actual products. |
| `Ibrutinib` row fixed | The seed had brand and generic swapped. |
| Categories renamed | Oncology · HIV / AIDS · Hepatitis B & C · Men's Health · Diabetes & Insulin · Weight Management |
| Dosage form, cold chain and Rx flags added | Injectables, insulins, GLP-1 pens and biologics are flagged as cold chain. Everything is Rx except Orlistat 60 mg. |
| Every row set to `verified=N` | The pharmacist team must confirm each row; until then the product page shows a "being verified" note. |

## What was excluded (16 rows)
| Product(s) | Reason |
|---|---|
| Phentermine, Adipex-P, Lomaira, Qsymia (phentermine), Didrex (benzphetamine), Tenuate (diethylpropion), Bontril (phendimetrazine) | **Controlled / scheduled psychotropic substances.** Cross-border supply to individuals is illegal in most markets and would put domains, payments and ad accounts at risk. |
| Belviq (lorcaserin) | Withdrawn from the market in 2020. |
| Zonisamide, Topiramate (listed under weight loss) | Off-label for weight loss; misleading in that category. |
| Plenity | A medical device, not a medicine. |
| Zepbound, Basaglar, Glucophage, Rybelsus WL, Viread HBV | Duplicates of other rows (same molecule and strength). |

## Still to review (MediSeller team)
- Men's Health: dapoxetine combinations (Super P-Force, Extra Super Tadarise) are not approved in many importing countries. Decide whether to keep them listed.
- Pack sizes, MOQ, actual manufacturer per product, and real product images.
- The full catalogue from the IndiaMart storefront and the client's Excel sheet should be merged in. Use the same CSV columns.
