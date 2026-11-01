"""One-off: build sites/mediseller/catalogue/products.csv from the Mediseller-2.0 seed data.

Usage:  python3 scripts/seed_from_mediseller2.py /path/to/Mediseller-2.0/backend/server.py

Rules applied (see docs/CATALOGUE-NOTES.md):
- Controlled / scheduled substances and market-withdrawn drugs are EXCLUDED.
- Duplicates are merged.
- Originator brands (non-Indian manufacturers) are listed under the generic name,
  with the originator kept as a "reference brand" for search. Indian brands keep their brand name.
- Every row is verified=N until the MediSeller team confirms it.
- No prices are carried over (pricing is hidden — "Get best price").
"""
import csv, re, sys, pathlib

SRC = sys.argv[1] if len(sys.argv) > 1 else '../mediseller-2.0/backend/server.py'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'sites/mediseller/catalogue/products.csv'

EXCLUDE = {
    # Controlled / scheduled substances — not to be offered for cross-border sale
    'Qsymia', 'Phentermine', 'Adipex-P', 'Lomaira', 'Didrex', 'Tenuate', 'Bontril',
    # Withdrawn from market (2020)
    'Belviq',
    # Off-label for the category / device, not a medicine listing
    'Zonisamide', 'Topiramate', 'Plenity',
    # Duplicates of other rows
    'Rybelsus WL', 'Viread HBV', 'Glucophage', 'Zepbound', 'Basaglar',
}
FIX = {  # source data errors
    'Ibrutinib': {'name': 'Imbruvica', 'generic_name': 'Ibrutinib'},
}
INDIAN = {'Cipla', 'Natco', 'Mylan', 'Hetero', "Dr. Reddy's", 'Ajanta', 'Centurion', 'Fortune',
          'Sunrise', 'Zydus', 'Ranbaxy', 'Aurochem', 'Macleods', 'Combitic', 'Generic'}
CATS = {
    'Cancer': 'Oncology',
    'HIV/AIDS': 'HIV / AIDS',
    'Hepatitis': 'Hepatitis B & C',
    'Erectile Dysfunction': "Men's Health",
    'Diabetes & Insulin': 'Diabetes & Insulin',
    'Weight Loss': 'Weight Management',
}
INJECT = {'Keytruda', 'Opdivo', 'Herceptin', 'Pegasys', 'Fuzeon', 'Cabenuva', 'Lantus', 'Humalog',
          'NovoRapid', 'Levemir', 'Tresiba', 'Ozempic', 'Trulicity', 'Victoza', 'Basaglar', 'Toujeo',
          'Wegovy', 'Saxenda', 'Mounjaro', 'Zepbound', 'Imcivree'}
CAPSULE = {'Revlimid', 'Imbruvica', 'Sutent', 'Pomalyst', 'Xtandi', 'Alecensa', 'Xenical', 'Alli'}
COLD = INJECT  # biologics, insulins, GLP-1 pens: cold chain
NON_RX = {'Alli'}


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def g(k, s):
    m = re.search(r'"%s": "([^"]*)"' % k, s)
    return m.group(1) if m else ''


rows, buf = [], []
for line in open(SRC, encoding='utf-8'):
    s = line.strip()
    if s.startswith('{"name"') and '"generic_name"' in s:
        buf.append({k: g(k, s) for k in ['name', 'generic_name', 'brand', 'dosage', 'desc']})
    m = re.search(r'"category": "([^"]+)"', s)
    if m and buf:
        for d in buf:
            d['category'] = m.group(1)
        rows += buf
        buf = []

out = []
for d in rows:
    if d['name'] in EXCLUDE:
        continue
    d.update(FIX.get(d['name'], {}))
    brand_is_indian = d['brand'] in INDIAN
    generic = d['generic_name'].replace(' + ', ' / ')
    strength = d['dosage'].replace('mg', ' mg').replace('U/ml', ' IU/ml').replace('mcg', ' mcg').replace('  ', ' ').strip()
    if brand_is_indian and d['brand'] != 'Generic':
        name, ref = d['name'], ''
    else:
        name, ref = f"{generic} {strength}", ('' if d['brand'] == 'Generic' else f"{d['name']} ({d['brand']})")
    form = 'Injection' if d['name'] in INJECT else 'Capsule' if d['name'] in CAPSULE else 'Tablet'
    unit = 'Pens / Vials' if form == 'Injection' else 'Strips / Bottles'
    out.append({
        'sku': f"MS-{slug(d['name'])}",
        'slug': slug(f"{name}" if not ref else f"{generic}-{strength}"),
        'name': name,
        'generic': generic,
        'strength': strength,
        'form': form,
        'pack': '',
        'unit': unit,
        'manufacturer': d['brand'] if brand_is_indian and d['brand'] != 'Generic' else 'Indian generic / originator — confirmed by agent',
        'reference_brand': ref,
        'category': CATS[d['category']],
        'rx': 'N' if d['name'] in NON_RX else 'Y',
        'cold_chain': 'Y' if d['name'] in COLD else 'N',
        'moq': '',
        'image': '',
        'short_desc': d['desc'],
        'storage': 'Refrigerate 2–8 °C. Ships in cold-chain packaging.' if d['name'] in COLD else 'Store below 25 °C, away from moisture.',
        'featured': 'Y' if d['name'] in {'Gleevec', 'Tagrisso', 'Epclusa', 'Hepcinat Plus', 'Lantus', 'Mounjaro', 'Biktarvy', 'Revlimid'} else 'N',
        'status': 'live',
        'sites': 'mediseller',
        'verified': 'N',
    })

# de-duplicate slugs
seen = {}
for r in out:
    if r['slug'] in seen:
        seen[r['slug']] += 1
        r['slug'] = f"{r['slug']}-{seen[r['slug']]}"
    else:
        seen[r['slug']] = 1

OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
    w.writeheader()
    w.writerows(out)
print(f'{len(out)} products → {OUT}')
