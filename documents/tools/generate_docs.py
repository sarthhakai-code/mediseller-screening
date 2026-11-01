#!/usr/bin/env python3
"""Generates MEDISELLER document HTML from data extracted from the original notices."""
import os, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = html.escape

def hi(t):  # Hindi span
    return f'<span class="hi">{t}</span>'

def control(fields):
    cells = []
    for k, v in fields:
        val = '<span class="blank"></span>' if v is None else f"<span>{v}</span>"
        cells.append(f"<div><b>{k}</b>{val}</div>")
    return '<div class="ms-control">' + "".join(cells) + "</div>"

def default_control(code, applies, eff="01 Nov 2026"):
    return [("Doc code", code), ("Version", "1.0"), ("Effective", eff),
            ("Applies to", applies), ("Owner", None), ("Approved by", None)]

def render(doc, pages):
    """doc: dict(code, cat, chip_en, chip_hi, title_en, title_hi, sub_en, sub_hi, control, folder, slug)
       pages: list of body-html strings."""
    n = len(pages)
    out = []
    for i, body in enumerate(pages, 1):
        if i == 1:
            top = f'''
  <header class="ms-header">
    <div class="ms-logo"><div class="ms-logo-placeholder">Official logo · master file pending</div></div>
    <div class="ms-header-meta">
      <span class="ms-chip">{doc["chip_en"]} · {hi(doc["chip_hi"])}</span>
      <span class="code">{doc["code"]}</span>
    </div>
  </header>
  <div class="ms-title compact">
    <h1>{doc["title_en"]}{f'<span class="hi">{doc["title_hi"]}</span>'}</h1>
    <div class="sub">{doc["sub_en"]} {hi("· " + doc["sub_hi"]) if doc.get("sub_hi") else ""}</div>
  </div>
  {control(doc["control"])}'''
        else:
            top = f'''
  <div class="ms-cont"><span class="t">MEDISELLER · {doc["title_en"]} {hi("· " + doc["title_hi"])}</span><span class="c">{doc["code"]} · continued</span></div>'''
        out.append(f'''<section class="page">{top}
  <main class="ms-body">
{body}
  </main>
  <footer class="ms-footer">
    <span class="brand">MEDISELLER</span>
    <span>{doc["code"]} · v1.0 · Page {i} of {n}</span>
    <span class="conf">Internal use only</span>
  </footer>
</section>''')
    page_html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{doc["code"]} · {doc["title_en"]}</title>
<link rel="stylesheet" href="../assets/mediseller-docs.css">
</head>
<body class="{doc["cat"]}">
{"".join(out)}
</body>
</html>
'''
    folder = os.path.join(ROOT, doc["folder"])
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{doc["code"]}_{doc["slug"]}.html')
    with open(path, "w") as f:
        f.write(page_html)
    print("wrote", path)

def table(headers, rows, cls="ms-table", colgroup=""):
    th = "".join(f'<th class="{c}">{h}</th>' for h, c in headers)
    body = []
    for r in rows:
        if isinstance(r, str):  # group row
            body.append(f'<tr class="group"><td colspan="{len(headers)}">{r}</td></tr>')
        else:
            body.append("<tr>" + "".join(f'<td class="{c}">{v}</td>' for v, c in r) + "</tr>")
    return f'<table class="{cls}">{colgroup}<thead><tr>{th}</tr></thead><tbody>{"".join(body)}</tbody></table>'

TBC = '<span class="tbc">[confirm]</span>'

def tbc_box(items):
    return ('<div class="tbc-box"><b>Pending verification</b> — items marked '
            '<span class="tbc">[confirm]</span> could not be read with certainty on the original or need sign-off:<ul>'
            + "".join(f"<li>{x}</li>" for x in items) + "</ul></div>")

# ===================================================================
# MS-PL-01  ED Product Catalogue
# ===================================================================
ed = [  # (product, composition, pack, manufacturer, flags)
 ("TADALAFIL", None),
 ("TADAPOX", "Tadalafil 20 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("SUPER TADARISE", "Tadalafil 20 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Sunrise", "name"),
 ("VIDALISTA CT 20", "Tadalafil 20 mg Chewable Tablets", "10×10 Tablets", "Centurion", "name"),
 ("TADARISE 20 JELLY", "Tadalafil 20 mg Oral Jelly", "1×7 Sachet", "Sunrise", ""),
 ("VEGALIS 20", "Tadalafil 20 mg Tablets", "1×4 Tablets", "Novita", ""),
 ("MEGALIS 20", "Tadalafil 20 mg Tablets", "1×4 Tablets", "Macleods", ""),
 ("VIDALISTA 20", "Tadalafil 20 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("TADARISE 20", "Tadalafil 20 mg Tablets", "10×10 Tablets", "Sunrise", ""),
 ("TADACIP 20 (S)", "Tadalafil 20 mg Tablets", "1×4 Tablets", "Cipla", ""),
 ("SUPER TADAPOX", "Tadalafil 40 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("EXTRA SUPER TADARISE", "Tadalafil 40 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Sunrise", ""),
 ("EXTRA LARGEXX MAX", "Tadalafil 40 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Mediseller", ""),
 ("LARGEXX MAX", "Tadalafil 40 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Mediseller", "pack"),
 ("SUPER KRISTA", "Tadalafil 40 mg & Dapoxetine 60 mg Tablets", "1×10 Tablets", "Lotus Bio", "pack"),
 ("ICOT", "Tadalafil 40 mg & Dapoxetine 60 mg Tablets", "1×10 Tablets", "Ambitree", ""),
 ("TADAROSE 40 PRO", "Tadalafil 40 mg Tablets", "10×10 Tablets", "Sunrise", ""),
 ("TADARISE 40", "Tadalafil 40 mg Tablets", "10×10 Tablets", "Sunrise", ""),
 ("VIDALISTA 40", "Tadalafil 40 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("TADAGA 5", "Tadalafil 5 mg Tablets", "10×10 Tablets", "Dharam", ""),
 ("VIDALISTA 5", "Tadalafil 5 mg Tablets", "1×10 Tablets", "Centurion", ""),
 ("TADARISE 5", "Tadalafil 5 mg Tablets", "10×10 Tablets", "Sunrise", ""),
 ("VIDALISTA 60", "Tadalafil 60 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("TADARISE 60", "Tadalafil 60 mg Tablets", "10×10 Tablets", "Sunrise", ""),
 ("VIDALISTA 80 BLACK", "Tadalafil 80 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("VIDALISTA 80", "Tadalafil 80 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("UDENAFIL", None),
 ("SUPER ZODEO", "Udenafil 100 mg & Dapoxetine 60 mg Tablets", "1×10 Tablets", "Ambitree", ""),
 ("ZUDENA 100", "Udenafil 100 mg Tablets", "1×4 Tablets", "Sunrise", ""),
 ("VARDENAFIL", None),
 ("VILITRA 10", "Vardenafil 10 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("LARGEXX POWER", "Vardenafil 20 mg Tablets", "10×10 Tablets", "Mediseller", ""),
 ("VIDOFIL 20", "Vardenafil 20 mg Tablets", "1×10 Tablets", "Either", "mfr"),
 ("LEVIFIL 20", "Vardenafil 20 mg Tablets", "1×10 Tablets", "Ambitree", ""),
 ("VILITRA 20", "Vardenafil 20 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("VILITRA 40", "Vardenafil 40 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("EXTRA LARGEXX", "Vardenafil 100 mg & Dapoxetine 100 mg Tablets", "10×10 Tablets", "Mediseller", ""),
 ("EXTREME LEVIFIL SUPER POWER", "Vardenafil 20 mg & Dapoxetine 100 mg Tablets", "1×10 Tablets", "Ambitree", ""),
 ("LEVIFIL JELLY", "Vardenafil 20 mg & Dapoxetine 60 mg Oral Jelly", "5 g × 7 Sachets", "Ambitree", ""),
 ("SUPER VILITRA", "Vardenafil 20 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("LEVIFIL POWER", "Vardenafil 20 mg & Dapoxetine 60 mg Tablets", "1×10 Tablets", "Ambitree", ""),
 ("SUPER ZHEWTRA", "Vardenafil 20 mg & Dapoxetine 60 mg Tablets", "1×4 Tablets", "Sunrise", ""),
 ("VIDOFILL SUPER POWER", "Vardenafil 40 mg & Dapoxetine 100 mg Tablets", "1×10 Tablets", "Either", "mfr"),
 ("VIDOFILL POWER", "Vardenafil 40 mg & Dapoxetine 100 mg Tablets", "1×10 Tablets", "Either", "mfr"),
 ("LARGEXX EXTRA POWER", "Vardenafil 40 mg & Dapoxetine 60 mg Tablets", "10×10 Tablets", "Mediseller", ""),
 ("KRRISTA POWER RED", "Vardenafil 40 mg & Dapoxetine 60 mg Tablets", "1×10 Tablets", "The Lotus Biotech", ""),
 ("LEVIFIL SUPER POWER", "Vardenafil 40 mg & Dapoxetine 60 mg Tablets", "1×10 Tablets", "Ambitree", ""),
 ("VILITRA 60", "Vardenafil 60 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("VILITRA 80", "Vardenafil 80 mg Tablets", "10×10 Tablets", "Centurion", ""),
 ("SILDENAFIL", None),
 ("SUPER P FORCE JELLY", "—", "—", "Sunrise", "comp"),
 ("SUPER KAMAGRA ORAL JELLY", "—", "—", "Ajanta", "comp"),
 ("CENFORCE D", "—", "10×10 Tablets", "Centurion", "comp"),
]

def ed_rows(items, start):
    rows, i = [], start
    for it in items:
        if it[1] is None:
            rows.append(f"{it[0]}-based")
            continue
        name, comp, pack, mfr, flag = it
        n = name + (" " + TBC if flag == "name" else "")
        c = comp + (" " + TBC if flag == "comp" else "")
        p = pack + (" " + TBC if flag == "pack" else "")
        m = mfr + (" " + TBC if flag == "mfr" else "")
        rows.append([(str(i), "idx"), (n, "strong"), (c, ""), (p, ""), (m, "")])
        i += 1
    return rows, i

ed_head = [("#", ""), ("Product " + hi("उत्पाद"), ""), ("Composition " + hi("संरचना"), ""),
           ("Pack " + hi("पैक"), ""), ("Manufacturer " + hi("निर्माता"), "")]
split = 23  # page 1: banner + first Tadalafil rows
r1, nxt = ed_rows(ed[:split], 1)
r2, _ = ed_rows(ed[split:], nxt)
banner = f'''<div class="banner"><div class="fig">₹5<small>per strip</small></div>
<div class="txt"><b>ED Scheme — earn ₹5 on every strip sold from this list.</b>
{hi("ईडी योजना — इस सूची के हर स्ट्रिप की बिक्री पर ₹5 कमाएँ।")}</div></div>'''
render(dict(code="MS-PL-01", cat="cat-pricelist", chip_en="Price List", chip_hi="मूल्य सूची",
            title_en="ED Product Catalogue", title_hi="ईडी उत्पाद सूची",
            sub_en="Brands, composition, pack size and manufacturer", sub_hi="ब्रांड, संरचना, पैक व निर्माता",
            control=default_control("MS-PL-01", "Domestic &amp; Global sales"),
            folder="price-lists", slug="ED-Product-Catalogue"),
       [banner + table(ed_head, r1, "ms-table dense"),
        table(ed_head, r2, "ms-table dense") + tbc_box([
            "Rows 2–3: product names are torn on the original. Read as <b>Super Tadarise</b> (Tadalafil 20 + Dapoxetine 60, Sunrise) and <b>Vidalista CT 20</b> (chewable, Centurion).",
            "Largexx Max and Super Krista: the pack sizes are partly torn. Read as 10×10 and 1×10 Tablets.",
            "\"Either\" is printed as the manufacturer for Vidofil 20, Vidofill Power and Vidofill Super Power. Please confirm the actual maker.",
            "Super P Force Jelly, Super Kamagra Oral Jelly and Cenforce D have no composition on the original (and no pack for the two jellies).",
            "Spelling corrected from the original: Etxra → Extra Largexx; Tablests → Tablets; Levifill Jely → Levifil Jelly.",
        ])])

# ===================================================================
# MS-PL-02  Aramex rate card
# ===================================================================
aramex = [("Armenia",150,185,260),("Bahrain",50,70,90),("Bolivia",150,185,260),("Cyprus",85,105,155),
 ("Dominican Republic",150,185,260),("Egypt",130,150,195),("Ethiopia",130,150,195),("Germany",85,105,155),
 ("Ghana",130,150,195),("Iraq",160,190,260),("Ireland",50,80,110),("Israel",150,180,240),("Jordan",50,65,90),
 ("Kenya",130,150,195),("Kuwait",50,75,110),("Libya",130,150,195),("Nigeria",130,150,195),("Oman",50,80,120),
 ("Papua New Guinea",165,190,240),("Qatar",50,80,125),("Reunion",150,185,260),("Saudi Arabia",50,80,110),
 ("Spain",85,105,155),("Sweden",85,105,155),("Switzerland",85,105,155),("Uganda",130,150,195),
 ("United Arab Emirates",50,60,80)]
ar_rows = [[(str(i), "idx"), (c, "strong"), (f"$ {a}", "num"), (f"$ {b}", "num"), (f"$ {d}", "num")]
           for i, (c, a, b, d) in enumerate(aramex, 1)]
ar_head = [("#", ""), ("Destination " + hi("गंतव्य"), ""),
           ("Light<br>1–2 kg " + hi("हल्का"), "num"), ("Medium<br>2.01–3 kg " + hi("मध्यम"), "num"),
           ("Heavy<br>3.01–5 kg " + hi("भारी"), "num")]
render(dict(code="MS-PL-02", cat="cat-pricelist", chip_en="Rate Card", chip_hi="दर कार्ड",
            title_en="Aramex International Shipping Rate Card", title_hi="अरामेक्स अंतरराष्ट्रीय शिपिंग दर कार्ड",
            sub_en="Rates in USD per shipment", sub_hi="दरें USD में, प्रति शिपमेंट",
            control=[("Doc code","MS-PL-02"),("Version","1.0"),("Effective","29 Aug 2026"),
                     ("Valid until","29 Nov 2026"),("Owner",None),("Approved by",None)],
            folder="price-lists", slug="Aramex-Shipping-Rate-Card"),
       ['<div class="grid-2">' + table(ar_head, ar_rows[:14], "ms-table dense") + table(ar_head, ar_rows[14:], "ms-table dense") + '</div>' +
        '<div class="callout"><b>How to quote:</b> pick the weight slab using the total packed weight of the shipment, then quote the rate for the destination. Countries not listed: check with the dispatch team before quoting.<br>'
        + hi("कोटेशन कैसे दें: शिपमेंट के कुल पैक वज़न से स्लैब चुनें और गंतव्य की दर बताएँ। सूची में न होने वाले देशों के लिए पहले डिस्पैच टीम से पुष्टि करें।") + "</div>"
        + '<p class="small">Rates as printed on the Aramex card effective 29 Aug 2026. Re-issue this card when the rates change or by the valid-until date.</p>'])

# ===================================================================
# MS-INC-01  Sales Agent Incentive Scheme
# ===================================================================
inc = [
 ("INSULIN &amp; DIABETES",),
 ("Humalog Mix 25 Kwikpen","₹3,200","₹50 / box","—","—"),
 ("Humalog Mix 25 Cartridges","₹3,200","₹50 / box","—","—"),
 ("Novomix Flexpen","₹3,200","₹50 / box","—","—"),
 ("Basalog Cartridges","₹2,200","₹100 / box","—","—"),
 ("Rybelsus 7","₹20 / box","₹20 / box","—","—"),
 ("SEXUAL WELLNESS",),
 ("Largex Group (single strip)","₹400","₹50 / strip","—","—"),
 ("Kamagra Jelly","₹450","₹10 / unit","—","—"),
 ("Tadarise Jelly","₹400<br><span class='small'>(sell ≥ ₹350 + ₹50 margin)</span>","₹10 / unit","—","—"),
 ("Super P Force Jelly","₹400","₹50 / unit","—","—"),
 ("Super Mini Force","₹400","₹50 / unit","—","—"),
 ("Tadacip 20","₹700 (2 strips)","₹20 / strip","—","—"),
 ("Suhagra 100","₹700 (2 strips)","₹20 / strip","—","—"),
 ("Hiforce DS","—","₹50 / unit","—","—"),
 ("Varnismon 1 mg","₹700","₹10 / strip","₹20 / strip","50 strips / month"),
 ("PartySmart (Himalaya)","Dec-expiry stock","₹20 / unit","—","—"),
 ("ED Product Catalogue (MS-PL-01) — scheme","—","₹5 / strip","—","—"),
 ("OTHER PRODUCTS",),
 ("Uniqueen 30 gm","₹450","₹50 / tube","—","—"),
 ("Accufine 10 mg","₹10 / strip","₹10 / strip","—","—"),
 ("Accufine 40 mg","₹10 / strip","₹10 / strip","—","—"),
 ("Ivermectin","₹20 / box","₹20 / box","₹40 / box","50 boxes / month"),
 ("Febendazole","₹10 / box","₹10 / box","—","—"),
 ("Nervismart 75","₹20 / strip","₹20 / strip","—","—"),
 ("Nervismart 450","₹20 / box","₹20 / box","—","—"),
 ("Defcort 60","₹10 / box","₹10 / box","—","—"),
 ("Anagrelide","—","₹500 / unit","—","—"),
]
rows, i = [], 1
for r in inc:
    if len(r) == 1:
        rows.append(r[0]); continue
    rows.append([(str(i),"idx"),(r[0],"strong"),(r[1],""),(r[2],""),(r[3],""),(r[4],"")]); i += 1
inc_head = [("#",""),("Product "+hi("उत्पाद"),""),("Basic price "+hi("मूल कीमत"),""),
            ("Commission / unit "+hi("कमीशन"),""),("Bulk incentive "+hi("थोक प्रोत्साहन"),""),
            ("Min qty &amp; period "+hi("न्यूनतम मात्रा"),"")]
how = f'''<div class="grid-3">
<div class="card"><h4>1 · Basic price incentive {hi("मूल कीमत प्रोत्साहन")}</h4>Sell above the basic price; the extra amount is your profit.<br>{hi("मूल कीमत से ऊपर की राशि आपका अतिरिक्त लाभ है।")}</div>
<div class="card"><h4>2 · Commission {hi("कमीशन")}</h4>A fixed ₹ per unit sold, paid only when the price is at or above the basic price.<br>{hi("कमीशन तभी मिलेगा जब बिक्री मूल्य मूल कीमत के बराबर या अधिक हो।")}</div>
<div class="card"><h4>3 · Bulk incentive {hi("थोक प्रोत्साहन")}</h4>An extra ₹ per unit when you reach the monthly minimum quantity.<br>{hi("मासिक न्यूनतम मात्रा पूरी होने पर अतिरिक्त राशि।")}</div>
</div>'''
gold = f'''<div class="banner mt"><div class="fig">GOLD<small>tier</small></div>
<div class="txt"><b>Reach ₹4,000 → earn ₹1,000 extra.</b> {TBC.replace('tbc','tbc" style="color:#fff')}
{hi("₹4,000 पूरा करने पर ₹1,000 अतिरिक्त।")}</div></div>'''
render(dict(code="MS-INC-01", cat="cat-incentive", chip_en="Incentive", chip_hi="प्रोत्साहन",
            title_en="Sales Agent Incentive Scheme", title_hi="सेल्स एजेंट प्रोत्साहन योजना",
            sub_en="Three incentive types working for you at the same time", sub_hi="तीन प्रोत्साहन एक साथ",
            control=default_control("MS-INC-01", "All sales agents"),
            folder="incentives", slug="Sales-Agent-Incentive-Scheme"),
       [how + '<div class="mt"></div>' + table(inc_head, rows[:18], "ms-table dense"),
        table(inc_head, rows[18:], "ms-table dense") + gold + tbc_box([
           "Gold tier: from the handwritten note \"Gold = 4000 | 1000 Extra\". Please confirm what the ₹4,000 is measured on (monthly sales value, commission earned or units) and the period.",
           "Basalog Cartridges commission was smudged on the original. Read as ₹100 / box, as you confirmed.",
           "Accufine 10 mg / 40 mg: the original lists \"₹10 / strip\" under both basic price and commission. Shown as printed.",
           "Row 17 (Evolve / Kachela 7 British) was crossed out on the original and has been removed.",
       ])])

# ===================================================================
# SOP — shifts and day blocks
# ===================================================================
SHIFTS = [("Shift 1", 10*60+30), ("Shift 2", 10*60), ("Shift 3", 9*60+30), ("Shift 4", 11*60)]
def clock(m):
    h, mm = divmod(m, 60)
    suf = "AM" if h < 12 else "PM"
    h12 = h if 1 <= h <= 12 else (h - 12 if h > 12 else 12)
    return f"{h12}:{mm:02d}"
BLOCKS = [  # (id, start_off, end_off, name_en, name_hi)
 ("B1", 0, 15, "Promotion: status, stories, moments, broadcast", "प्रमोशन"),
 ("B2", 15, 60, "Essential tasks: archive, label, save contacts, activation", "आवश्यक कार्य"),
 ("B3", 60, 150, "Fresh leads &amp; live WhatsApp queries", "नई लीड व प्रश्न"),
 ("B4", 150, 210, "Follow-ups: Global first, then Domestic", "फ़ॉलो-अप"),
 ("B5", 210, 240, "Last-week buy leads (T-2)", "पिछले सप्ताह की बाय-लीड"),
 ("B6", 240, 270, "Break", "ब्रेक"),
 ("B7", 270, 300, "International apps &amp; email activation", "अंतरराष्ट्रीय ऐप्स"),
 ("B8", 300, 480, "Calling campaigns (activation &amp; retention)", "कॉलिंग अभियान"),
 ("B9", 480, 510, "Follow-up calls: Active customers", "सक्रिय ग्राहक कॉल"),
 ("B10", 510, 540, "End-of-day close &amp; reporting", "दिन का समापन"),
]
def off(m):
    return f"+{m//60}:{m%60:02d}"
shift_head = [("Shift "+hi("शिफ्ट"),""),("Start "+hi("शुरू"),""),("End "+hi("समाप्त"),""),("Hours",""),]
shift_rows = [[(s,"strong"),(clock(st)+(" AM" if st<720 else " PM"),""),(clock(st+540)+" PM",""),("9 h","")] for s, st in SHIFTS]

SHIFT_CARDS = '<div class="grid-3" style="grid-template-columns:repeat(4,1fr)">' + "".join(
    f'<div class="card"><h4>{s}</h4><b style="font-size:11pt">{clock(st)} {"AM" if st<720 else "PM"} – {clock(st+540)} PM</b></div>' for s, st in SHIFTS) + '</div>'
blk_head = [("Block",""),("Activity "+hi("गतिविधि"),""),("From start",""),] + [(s.replace("Shift ","S"),"ctr") for s,_ in SHIFTS]
blk_rows = []
for b, a, z, en, h in BLOCKS:
    r = [(b,"strong"),(f"{en}<br>{hi(h)}",""),(f"{off(a)} – {off(z)}","")]
    for _, st in SHIFTS:
        r.append((f"{clock(st+a)}–{clock(st+z)}","ctr"))
    blk_rows.append(r)

STANDING = f'''<ul class="check">
<li><div>Reply to every WhatsApp message within <b>10 minutes</b>. {hi("हर व्हाट्सऐप संदेश का जवाब 10 मिनट के भीतर दें।")}</div></li>
<li><div>Check and update all WhatsApp accounts every <b>15 minutes</b>. {hi("हर 15 मिनट में सभी व्हाट्सऐप अकाउंट जाँचें और अपडेट करें।")}</div></li>
<li><div>Update customer status within <b>5 minutes</b> of every interaction. {hi("हर बातचीत के 5 मिनट के भीतर ग्राहक की स्थिति अपडेट करें।")}</div></li>
<li><div>Update the Lead Sheet after every call or message; <b>no pending updates</b>. {hi("हर कॉल/संदेश के बाद लीड शीट अपडेट करें — कुछ भी लंबित न रहे।")}</div></li>
<li><div>Phones: follow <b>MS-POL-01</b> (personal phone use ₹1,000 penalty). {hi("फ़ोन नीति MS-POL-01 का पालन करें।")}</div></li>
</ul>'''
PRIORITY = '<div class="chain"><span>On-Payment</span><i>→</i><span>High Value</span><i>→</i><span>Active</span><i>→</i><span>Interested</span><i>→</i><span>New Leads</span></div>'

# Master task register: (id, group, task, when, source)
REG = [
 ("C01","common","Upload WhatsApp status/story on all business devices (2 products: best products, new arrivals, offers, top sellers).","B1","Sales SOP I.2; Morning tasks note"),
 ("C02","common","Send the daily broadcast message.","B1","Lakshy plan; Morning tasks note"),
 ("C03","common","Archive the previous day's completed chats on all WhatsApp accounts.","B2","Sales SOP I.1; Day Planner"),
 ("C04","common","Label every active chat: On-Payment, Interested, Active, Deal Done, High Value, Repeat Buyer. No active customer stays unlabelled.","B2","Sales SOP I.1"),
 ("C05","common","Save yesterday's deal-done customers to phonebook + CRM as <b>Name – Country – Product</b>; sync WhatsApp and CRM.","B2","Sales SOP I.3; Day Planner (DD)"),
 ("C06","common","Review yesterday's chats for anything pending.","B2","Day Planner"),
 ("C07","common","Respond to all WhatsApp messages and queries in priority order On-Payment → High Value → Active → Interested → New Leads.","B3 · all day","Sales SOP II.1"),
 ("C08","common","Reply to all Chatwoot conversations.","B3","Morning tasks note"),
 ("C09","common","Follow-ups: On-Payment (PI sent, payment reminder), Interested (requested details), Active (awaiting confirmation). Record every follow-up in the Lead Sheet.","B4","Sales SOP II.2; IndiaMART note"),
 ("C10","common","Keep the Lead Sheet live: Customer Name, Country, Product, Lead Type, Stage (New / Interested / On-Payment / Closed), Remarks &amp; Next Follow-up Date.","All day","Sales SOP II.3"),
 ("C11","common","Prepare quotations and tag the lead type.","As needed","Morning tasks note"),
 ("C12","common","Share the Telegram group link with customers.","As needed","Day Planner"),
 ("C13","common","Campaign 1 · Activation – best products (30 leads/day): call new leads interested in best-sellers → verify requirement → present best prices → collect order details. Record outcomes.","B8","Sales SOP III.1; Day Planner"),
 ("C14","common","Campaign 2 · Retention – new customers (ordered once, not reordered). Promote oncology, HIV, critical care, sexual wellness, chronic care.","B8","Sales SOP III.2"),
 ("C15","common","Campaign 3 · Retention – regular customers: replenishment calls; inform about new stock, expiry benefits, product alternatives.","B8","Sales SOP III.3"),
 ("C16","common","Campaign 4 · Retention – high-value customers: priority calls, personalised recommendations, exclusive deals or fast shipping.","B8","Sales SOP III.4"),
 ("C17","common","Campaign 5 · Activation – incentive leads: call all eligible leads; meet minimum conversions per target; update CRM.","B8","Sales SOP III.5"),
 ("C18","common","Retention data allocation: <b>Faiz</b> – Oct, Nov, Dec data · <b>Disha</b> – May, Jun, Jul data.","B8","Lakshy plan"),
 ("C19","common","Follow-up calls to all Active customers.","B9","Lakshy plan"),
 ("C20","common","Maintain the Active-customer notebook (Sourav, Prince).","Daily","Morning tasks note"),
 ("C21","common","Share tracking details with customers whose orders have shipped.","B10","IndiaMART note #12"),
 ("C22","common","Daily data entry: App-sheet data (no. of deals), self-deal data, domestic data.","B10","IndiaMART note #9–11 "+TBC),
 ("C23","common","End-of-day: all chats labelled; all lead sheets updated; minimum calling targets met; promotions completed; 100% follow-up completion (Global + Domestic).","B10","Sales SOP – EOD"),
 ("D01","domestic","Take 1 IndiaMART buy lead at block B2 and 1 more at block B4.","B2 · B4","IndiaMART note #3, #5"),
 ("D02","domestic","India buy leads (T-1).","B3","Day Planner"),
 ("D03","domestic","Domestic follow-ups (after Global): On-Payment customers, Active customers, ExportersIndia + TradeIndia leads. Scope: India B2B + retail.","B4","Sales SOP II.2; IndiaMART note"),
 ("D04","domestic","Last-week buy leads (dates 7, 8, 9 in the example), T-2.","B5","Lakshy plan"),
 ("D05","domestic","IndiaMART calling block (3–6 PM for Shift 2).","B8","IndiaMART note"),
 ("D06","domestic","Direct leads, 6–7 PM.","6–7 PM "+TBC,"Day Planner"),
 ("G01","global","Post on WeChat Moments for a global audience: oncology, HIV, hepatitis, chronic care, supplements.","B1","Sales SOP I.2"),
 ("G02","global","IndiaMART Global activation: open all Global leads from the past 24 h, send activation messages with CTA, mark responders \"Activated\".","B2","Sales SOP I.4; IndiaMART note #2"),
 ("G03","global","Global follow-ups first: USA, Canada, UK, EU, Australia, Middle East. On-Payment messages, Active customers, ad leads.","B4","Sales SOP II.2; IndiaMART note"),
 ("G04","global","Email global activation: daily emails to new global enquiries (company intro + product range + CTA + WhatsApp link). Minimum 15–20 per executive.","B7","Sales SOP II.4"),
 ("G05","global","International apps: Telegram, Line, Viber, Signal, WeChat, Botim. Minimum 5 messages per app; reconnect previous leads; share new offers, new stock and best products; record in the Lead Sheet.","B7","Sales SOP II.5; Lakshy plan"),
 ("G06","global","Message 10 customers in Hong Kong about ED products.","B7","IndiaMART note #6"),
 ("G07","global","Quote shipping from the Aramex rate card (MS-PL-02).","As needed","Aramex card"),
 ("A01","act","Keyword calls on scheme products: 25 calls per product × 4 products a day (100 calls), from MS-REF-02.","B3 · B8","Activation note #1"),
 ("A02","act","Platform activation: TradeIndia, ExportersIndia and IndiaMART (T-2). Message on IndiaMART, then call.","B3","Activation note #2"),
 ("A03","act","Buy-lead activation: last week's and T-2 buy leads.","B5","Activation note #3"),
 ("A04","act","Database calling: 2022 · 2023 · 2024 deal-done customers.","B8","Activation note #4"),
 ("A05","act","Database calling: old lead sheets (Riya, Disha, Shivani, Sahil etc.).","B8","Activation note #4"),
 ("A06","act","Database calling: new data — doctors, B2B, pharmacies.","B8","Activation note #4"),
 ("A07","act","Database calling: T-2 TradeIndia / ExportersIndia leads; RTO, cancelled and notebook leads.","B8","Activation note #4"),
 ("A08","act","Chats: archiving and other apps (Viber, Signal etc.).","B2 · B7","Activation note #5"),
 ("A09","act","Lead sheets updated properly. Record <b>Active + Interested only</b>.","All day","Activation note #6"),
]
GTAG = {"common":'<span class="tag common">Common</span>',"domestic":'<span class="tag domestic">Domestic</span>',
        "global":'<span class="tag glob">Global</span>',"act":'<span class="tag act">Activation</span>'}
reg_head = [("ID",""),("Group "+hi("समूह"),""),("Task "+hi("कार्य"),""),("When",""),("Source "+hi("स्रोत"),"")]
def reg_rows(items):
    return [[(r[0],"strong"),(GTAG[r[1]],""),(r[2],""),(r[3],""),(f'<span class="small">{r[4]}</span>',"")] for r in items]

LEGEND = '<p class="small"><b>T-1</b> = leads from yesterday · <b>T-2</b> = leads from two days ago · <b>PI</b> = proforma invoice · <b>DD</b> = deal done · <b>B1–B10</b> = day blocks (see page 1).</p>'

SOP_TBC = tbc_box([
  "The day blocks combine four sources: the printed Sales SOP (10:30–5:00), the Lakshy plan (10:00–6:30), the IndiaMART note and the Day Planner. Please sign off the timings.",
  "B6 Break (30 min): inferred from the 2:00–2:30 gap in the Lakshy plan. Confirm the break time and length.",
  "B10 End-of-day (last 30 min): added so each 9-hour shift ends with the printed SOP's end-of-day checklist.",
  "Morning-tasks note: \"WeChat / Ichu lne chahiye\" and the lines \"INDIA → …\" / \"Australia → …\" are partly illegible and not yet included.",
  "C22: the meaning of \"App sheet data till No. of deals → 1\", \"Self deal data – 1\" and \"Domestic data – 2023 – 1\" needs confirming.",
])

render(dict(code="MS-SOP-01", cat="cat-sop", chip_en="SOP", chip_hi="मानक प्रक्रिया",
            title_en="Daily Sales Operations — Master SOP", title_hi="दैनिक बिक्री संचालन — मुख्य प्रक्रिया",
            sub_en="Shifts, day structure, standing rules and the master task register", sub_hi="शिफ्ट, दिन की संरचना व कार्य रजिस्टर",
            control=default_control("MS-SOP-01", "All sales &amp; activation staff"),
            folder="sops", slug="Daily-Sales-Operations-Master-SOP"),
       [f'''<h2 class="sec">Shift timings {hi("शिफ्ट समय")}</h2>
{SHIFT_CARDS}
<h2 class="sec">Day structure {hi("दिन की संरचना")}</h2>
<p class="lead">Every shift follows the same blocks, counted from the shift start. The four right-hand columns give the clock time for each shift.</p>
{table(blk_head, blk_rows, "ms-table dense")}
''',
        f'''<h2 class="sec">Standing rules — all day {hi("स्थायी नियम")}</h2>
{STANDING}
<h3 class="sub">Priority order for replies {hi("उत्तर प्राथमिकता क्रम")}</h3>
{PRIORITY}
<h2 class="sec mt">Who does what {hi("कौन क्या करेगा")}</h2>
<p class="lead">Tasks fall into four groups. <b>Common</b> tasks are done by every executive, whether India or Global sales. Each group has its own one-page daily checklist.</p>
<div class="grid-2">
<div class="card"><h4>{GTAG["common"]} All staff · MS-SOP-02</h4>Essential tasks, WhatsApp replies, follow-ups, lead sheet, calling campaigns, end-of-day close.</div>
<div class="card"><h4>{GTAG["domestic"]} India sales · MS-SOP-03</h4>IndiaMART buy leads, India B2B + retail follow-ups, ExportersIndia / TradeIndia, the IndiaMART calling block.</div>
<div class="card"><h4>{GTAG["global"]} Global sales · MS-SOP-04</h4>IndiaMART Global activation, WeChat Moments, global follow-ups, email activation, international apps, Aramex quotes.</div>
<div class="card"><h4>{GTAG["act"]} Activation team · MS-SOP-05</h4>Keyword calls, platform and buy-lead activation, database calling, chat archiving.</div>
</div>
{LEGEND}''',
        f'''<h2 class="sec">Master task register {hi("मुख्य कार्य रजिस्टर")}</h2>
{table(reg_head, reg_rows(REG[:16]), "ms-table dense")}''',
        f'''{table(reg_head, reg_rows(REG[16:33]), "ms-table dense")}''',
        f'''{table(reg_head, reg_rows(REG[33:]), "ms-table dense")}
{LEGEND}
{SOP_TBC}''',
       ])

# ---- Per-group daily checklists -------------------------------------
def block_label(bid):
    for b, a, z, en, h in BLOCKS:
        if b == bid: return f"{b} · {off(a)}"
    return bid

def checklist_page(group, intro):
    items = [r for r in REG if r[1] == group]
    order = {b[0]: i for i, b in enumerate(BLOCKS)}
    def key(r):
        w = r[3].split(" ")[0]
        return order.get(w, 98 if w == "All" else 99)
    items.sort(key=key)
    lis = "".join(f'<li><div><b>{r[0]}</b> · <span class="small">{r[3]}</span><br>{r[2]}</div></li>' for r in items)
    fill = '<div class="fill"><div>Executive name · नाम</div><div>Date · तिथि</div><div>Shift · शिफ्ट</div><div>Devices · डिवाइस</div></div>'
    return f'''{fill}<p class="lead">{intro}</p>
<h2 class="sec">Daily checklist {hi("दैनिक जाँच सूची")}</h2>
<ul class="check">{lis}</ul>'''

BLOCK_NOTE = '<div class="callout mt"><b>Block times:</b> B1–B10 are counted from your shift start. See the day-structure table in <b>MS-SOP-01</b> for the clock times of each shift.<br>' + hi("ब्लॉक का समय आपकी शिफ्ट शुरू होने से गिना जाता है — विवरण MS-SOP-01 में।") + '</div>'
blocks_mini = table([("Block",""),("From start",""),("Activity","")],
                    [[(b,"strong"),(f"{off(a)}–{off(z)}",""),(en,"")] for b,a,z,en,h in BLOCKS], "ms-table dense")

render(dict(code="MS-SOP-02", cat="cat-sop", chip_en="SOP", chip_hi="मानक प्रक्रिया",
            title_en="Common Tasks — All Staff", title_hi="सामान्य कार्य — सभी कर्मचारी",
            sub_en="Done by every executive, India or Global", sub_hi="हर कर्मचारी के लिए — घरेलू या अंतरराष्ट्रीय",
            control=default_control("MS-SOP-02", "All staff · all shifts"),
            folder="sops", slug="Common-Tasks-All-Staff"),
       [checklist_page("common", "Tick each task as you complete it. Block times for your shift are in MS-SOP-01.")
        .split('<ul class="check">')[0] + '<ul class="check">' +
        "".join(f'<li><div><b>{r[0]}</b> · <span class="small">{r[3]}</span><br>{r[2]}</div></li>' for r in REG if r[1]=="common" and REG.index(r) < 12) + "</ul>",
        '<ul class="check">' +
        "".join(f'<li><div><b>{r[0]}</b> · <span class="small">{r[3]}</span><br>{r[2]}</div></li>' for r in REG if r[1]=="common" and REG.index(r) >= 12) + "</ul>"
        + f'<h2 class="sec mt">Standing rules {hi("स्थायी नियम")}</h2>' + STANDING])

render(dict(code="MS-SOP-03", cat="cat-sop", chip_en="SOP", chip_hi="मानक प्रक्रिया",
            title_en="Domestic Sales Tasks", title_hi="घरेलू बिक्री कार्य",
            sub_en="India B2B + retail · in addition to Common Tasks (MS-SOP-02)", sub_hi="सामान्य कार्यों के अतिरिक्त",
            control=default_control("MS-SOP-03", "India sales executives"),
            folder="sops", slug="Domestic-Sales-Tasks"),
       [checklist_page("domestic", "Do these India-specific tasks <b>in addition to</b> the Common Tasks (MS-SOP-02). Domestic follow-ups start after Global follow-ups.")
        + BLOCK_NOTE + LEGEND])

render(dict(code="MS-SOP-04", cat="cat-sop", chip_en="SOP", chip_hi="मानक प्रक्रिया",
            title_en="Global Sales Tasks", title_hi="अंतरराष्ट्रीय बिक्री कार्य",
            sub_en="International markets · in addition to Common Tasks (MS-SOP-02)", sub_hi="सामान्य कार्यों के अतिरिक्त",
            control=default_control("MS-SOP-04", "Global sales executives"),
            folder="sops", slug="Global-Sales-Tasks"),
       [checklist_page("global", "Do these international tasks <b>in addition to</b> the Common Tasks (MS-SOP-02). Global follow-ups come first: USA, Canada, UK, EU, Australia, Middle East.")
        + BLOCK_NOTE])

render(dict(code="MS-SOP-05", cat="cat-sop", chip_en="SOP", chip_hi="मानक प्रक्रिया",
            title_en="Activation Team Tasks", title_hi="एक्टिवेशन टीम कार्य",
            sub_en="Lead activation and database calling", sub_hi="लीड एक्टिवेशन व डेटाबेस कॉलिंग",
            control=default_control("MS-SOP-05", "Activation team"),
            folder="sops", slug="Activation-Team-Tasks"),
       [checklist_page("act", "Daily activation targets. Use the keyword-call list (MS-REF-02) and record only Active + Interested leads in the Lead Sheet.")
        + f'''<div class="callout"><b>Target: 100 keyword calls a day</b> — 4 scheme products × 25 calls each. {hi("कीवर्ड कॉल: 4 योजना उत्पाद × 25 कॉल प्रत्येक।")}</div>
<h2 class="sec">Database sources {hi("डेटाबेस स्रोत")}</h2>
<div class="grid-3">
<div class="card"><h4>Past customers</h4><ul><li>2022 · 2023 · 2024 deal-done</li><li>RTO / cancelled orders</li><li>Notebooks</li></ul></div>
<div class="card"><h4>Old lead sheets</h4><ul><li>Riya</li><li>Disha</li><li>Shivani</li><li>Sahil, etc.</li></ul></div>
<div class="card"><h4>New data</h4><ul><li>Doctors</li><li>B2B</li><li>Pharmacies</li><li>T-2 TradeIndia / ExportersIndia</li></ul></div>
</div>''' + '<p class="small"><b>T-2</b> = leads from two days ago · <b>B1–B10</b> = day blocks (MS-SOP-01).</p>'])

# ===================================================================
# MS-REF-01  Lead stages
# ===================================================================
STG = [
 ("green","Connected + Active + Interested", [
   ("On-Payment — payment leads of today / yesterday","Follow-up 1"),
   ("On-Payment — payment leads of the last 3 days","Follow-up 1"),
   ("On-Payment — payment leads of last week","Follow-up 1"),
   ("Address shared by customer — share payment details for confirmation","Follow-up 2"),
   ("Quotation / order details shared","Follow-up 2"),
   ("Address not shared by customer, but order confirmed","Follow-up 2"),
   ("On-Payment — payment leads of last month","Follow-up 3"),
   ("Rates asked but final order not confirmed","Follow-up 3"),
   ("Wants to order next week / month / in a few days","Follow-up 3"),
 ]),
 ("yellow","Not Connected", [
   ("Not-connected leads — no response on call, not available on WhatsApp","Follow-up 4"),
   ("Already purchased — share the LAST price and connect for the next order","Follow-up 4"),
   ("No-response leads — on WhatsApp but no reply to message or call","Follow-up 4"),
 ]),
 ("red","Not Interested", [
   ("Did not make any enquiry","No follow-up"),
   ("Enquired for someone else","No follow-up"),
   ("Enquired by mistake","No follow-up"),
 ]),
]
stg_rows = []
for col, sub, items in STG:
    for j, (d, f) in enumerate(items):
        stg_rows.append([(f'<span class="tag {col}">{col.title()} stage</span>',""),
                         (f"<b>{sub}</b>" if j == 0 else "",""), (d,""), (f"<b>{f}</b>","")])
stg_head = [("Stage "+hi("चरण"),""),("Sub-status "+hi("उप-स्थिति"),""),("Description "+hi("विवरण"),""),("Follow-up "+hi("फ़ॉलो-अप"),"")]
render(dict(code="MS-REF-01", cat="cat-reference", chip_en="Reference", chip_hi="संदर्भ",
            title_en="Lead Stages &amp; Follow-up Guide", title_hi="लीड चरण एवं फ़ॉलो-अप गाइड",
            sub_en="Stage codes, WhatsApp labels and Lead Sheet standard", sub_hi="चरण, व्हाट्सऐप लेबल व लीड शीट मानक",
            control=default_control("MS-REF-01", "All sales &amp; activation staff"),
            folder="reference", slug="Lead-Stages-Follow-up-Guide"),
       [f'''<h2 class="sec">Stage &amp; follow-up matrix {hi("चरण व फ़ॉलो-अप तालिका")}</h2>
<p class="lead">Follow-up 1 is the first priority and Follow-up 4 the last. Red-stage leads get no follow-up.</p>
{table(stg_head, stg_rows, "ms-table dense")}
''',
       f'''<h2 class="sec">Reply priority {hi("उत्तर प्राथमिकता")}</h2>{PRIORITY}
<div class="grid-2 mt">
<div class="card"><h4>Follow-up categories {hi("श्रेणियाँ")}</h4><ul>
<li><b>On-Payment</b> — received PI, needs a payment reminder</li>
<li><b>Interested</b> — requested details</li>
<li><b>Active</b> — ongoing conversation, awaiting confirmation</li></ul></div>
<div class="card"><h4>WhatsApp labels {hi("व्हाट्सऐप लेबल")}</h4>
<span class="tag updated">On-Payment</span> <span class="tag updated">Interested</span> <span class="tag updated">Active</span>
<span class="tag updated">Deal Done</span> <span class="tag updated">High Value</span> <span class="tag updated">Repeat Buyer</span>
<p class="small">No active customer stays unlabelled.</p></div>
<div class="card"><h4>Lead Sheet columns {hi("लीड शीट कॉलम")}</h4><ul>
<li>Customer Name · Country · Product · Lead Type</li>
<li>Stage: New / Interested / On-Payment / Closed</li>
<li>Remarks &amp; Next Follow-up Date</li></ul></div>
<div class="card"><h4>Contact naming {hi("संपर्क नाम प्रारूप")}</h4>
<b>Name – Country – Product</b><p class="small">Save to phonebook + CRM, then sync with WhatsApp.</p></div>
</div>'''])

# ===================================================================
# MS-REF-02  Keyword-call product list
# ===================================================================
KW = [  # (name, global_only, priority)
 ("Prima Max",1,0),("Mifegest",1,0),("Frag Rib",1,0),("BPC157",1,0),("Zyrop",0,0),("Zoladex",0,0),
 ("Viagra 50/100",0,1),("Vaanismon / Varnitrip / Varnismart",0,1),("Tadarise",0,1),("Tadacip",0,1),("Suhagra",0,1),
 ("Ryzodeg",0,0),("Restasis",0,1),("R cinex",0,0),("PTH",0,0),("Orligal",0,0),("Novomix",0,1),("Motivyst",0,0),
 ("Lenvat (Lenvima / Lenvatinib)",0,0),("Lantus",0,0),("Instgra",0,0),("Hepbest",0,0),("Eye Drops",0,0),("Entaliv",0,0),
 ("Desifer 400",0,1),("Abirapro",0,0),("Xarelto",0,0),("Walcobal 2500",0,0),("Votrient 400",0,0),("Vilitra 20/40/60",0,0),
 ("Udaforce 100",0,1),("Trustiva",0,0),("Tretiheal Tube",0,1),("Tastyliya Super Active",0,1),("Tastyliya 20 Jelly",0,1),
 ("Tamoxifen / Mamofen",0,1),("Tafnat",0,0),
 ("Spegra",0,0),("Slimgal",0,1),("Seretide Accuhaler",0,1),("Ridusunate",0,0),("Restasis Eye Drop",0,1),("Regonat",0,0),
 ("R89",0,1),("R42",0,1),("Proluton Depot Inj",0,0),("Pradaxa 110",0,0),("Penon Tube",0,1),("Morr 10",0,0),
 ("Mini Super P Force",0,1),("Febendazole",0,0),("Malegra 200",0,1),("Malegra 100",0,1),("Luprodex / Lupride",0,0),
 ("Levifil Jelly",0,1),("KS Gold",0,1),("Kamagra 100 Effervescent",0,1),("Invokana",0,1),("Hucog",0,1),("Hiforce",0,1),
 ("Heptral",0,0),("Gluco One BG 20",0,0),("Fluzican",0,0),("Extra Super Verdapox",0,1),("Extra Super Tadarad",0,1),
 ("Denopsy",0,0),("Defrijet 250 / 500",0,1),("Dapoforce 30",0,1),("Da Zeagra",0,1),("Cresp",0,0),("Confido",0,0),
 ("Combotul 200",0,0),("Cineria Eye Drops",0,0),("Cineraria Maritima (Schwabe)",0,1),("Asunra",0,1),("Super P Force",0,1),
]
KW.sort(key=lambda x: x[0].lower())
def kw_row(i, k):
    name, g, p = k
    tags = (' <span class="tag priority">Priority</span>' if p else "") + (' <span class="tag global">Global only</span>' if g else "")
    if name == "Febendazole":
        tags += ' <span class="tag updated">replaces Mebendazole</span>'
    return [(str(i),"idx"),(f"{name}{tags}","")]
kwh = [("#",""),("Product "+hi("उत्पाद"),"")]
def kw_cols(a, b):
    mid = (a + b + 1) // 2
    l = table(kwh, [kw_row(i+1, KW[i]) for i in range(a, mid)], "ms-table dense")
    r = table(kwh, [kw_row(i+1, KW[i]) for i in range(mid, b)], "ms-table dense")
    return f'<div class="grid-2">{l}{r}</div>'
P1 = 36
render(dict(code="MS-REF-02", cat="cat-reference", chip_en="Reference", chip_hi="संदर्भ",
            title_en="Keyword-Call Product List", title_hi="कीवर्ड कॉल उत्पाद सूची",
            sub_en=f"{len(KW)} products · A–Z", sub_hi="उत्पाद सूची A–Z",
            control=default_control("MS-REF-02", "Activation team · sales"),
            folder="reference", slug="Keyword-Call-Product-List"),
       [f'''<div class="callout"><b>Target:</b> 25 calls per product × 4 products a day. Start with <span class="tag priority">Priority</span> products (in stock / priority). <span class="tag global">Global only</span> products are offered to international customers only.<br>{hi("लक्ष्य: प्रति उत्पाद 25 कॉल × प्रतिदिन 4 उत्पाद। पहले प्राथमिकता वाले उत्पाद लें।")}</div>
{kw_cols(0, P1)}''', kw_cols(P1, len(KW))])

# ===================================================================
# MS-REF-03  Hashtag library
# ===================================================================
HT = [
 ("Cancer Medications","#cancertreatment #oncologycare #chemotherapy #cancerpatients #cancersupport #oncologist #cancerawareness #cancertherapy #cancerrecovery #cancerindia"),
 ("Anti-HIV Drugs","#hivtreatment #hivawareness #antiretroviral #hivcare #hivsupport #hivpositive #aidsawareness #hivindia #hivmedication #sexualhealthindia"),
 ("Hepatitis C Medicine","#hepatitisc #liverhealth #hepatitistreatment #livercare #hepatitisawareness #hepc #liverdisease #hepatology #hepatitiscure #liverindia"),
 ("Kidney Disease Drugs","#kidneydisease #kidneycare #nephrology #dialysislife #kidneyhealth #ckd #kidneypatient #renalcare #kidneyindia #nephrologist"),
 ("Anti-Rabies Vaccines","#rabiesvaccine "+TBC+" #vaccination #petbite #animalbite #vaccinesafety #preventrabies #publichealthindia #immunization #rabiesawareness #healthprotection"),
 ("Erectile Dysfunction","#erectiledysfunction #menshealthindia #sexualhealth #edtreatment #menswellness #performancehealth #intimacyhealth #menscare #healthformen #edhelp"),
 ("Diabetes Medicine","#diabetescare #bloodsugar #diabetesindia #insulin #diabeticlife #glucosecontrol #type2diabetes #diabetesmanagement #healthylivingindia #sugarcontrol"),
 ("Birth Control","#birthcontrol #contraception #womenshealthindia #familyplanning #reproductivehealth #pillawareness #womenscare #contraceptivepill #healthforwomen #safechoice"),
 ("Hormone Therapy","#hormonetherapy #hrt #hormonebalance #womenshealth #menopausecare #hormonalhealth #endocrinology #hormonecare #healthbalance #hrtindia"),
 ("Ayurvedic Medicines","#ayurvedaindia #naturalhealing #herbalmedicine #ayurvediclifestyle #holistichealth #desiilaj #naturalremedies #ayurvediccare #indiannatural #wellnessindia"),
 ("Pain Relief","#painrelief #chronicpain #painmanagement #paincare #bodypain #reliefmedicine #jointpain #backpainindia #painfree #healthrelief"),
 ("Weight Loss","#weightlossindia #fatlossjourney #weightmanagement #slimmingtips #fitnessindia #dietcontrol #loseweightfast #healthylifestyleindia #fitjourney #weightlosshelp"),
 ("Eye / Ear","#eyecareindia #earcare #visioncare #eyehealth #earinfection #optometry #hearingcare #dryeyes #eyetreatment #earhealth"),
 ("Skin &amp; Beauty","#skincareindia #skinclinic #beautycare #glowingskin #dermatology #skintreatment #acnecare #skingoals #indianskincare #beautyindia"),
]
ht_rows = [[(str(i),"idx"),(c,"strong"),(f'<span style="color:var(--ms-blue);font-size:8pt">{t}</span>',"")] for i,(c,t) in enumerate(HT,1)]
render(dict(code="MS-REF-03", cat="cat-reference", chip_en="Reference", chip_hi="संदर्भ",
            title_en="Social Media Hashtag Library", title_hi="सोशल मीडिया हैशटैग सूची",
            sub_en="Add a category's tags to every story, Moment and post for it", sub_hi="हर स्टोरी, मोमेंट व पोस्ट में जोड़ें",
            control=default_control("MS-REF-03", "Status, stories, Moments, posts"),
            folder="reference", slug="Social-Media-Hashtag-Library"),
       [f'''{table([("#",""),("Category "+hi("श्रेणी"),""),("Hashtags "+hi("हैशटैग"),"")], ht_rows, "ms-table dense")}
{tbc_box(["Anti-Rabies Vaccines: the first hashtag is covered by a torn flap on the original. Read as #rabiesvaccine."])}'''])

# ===================================================================
# MS-REF-04  Contacts & devices
# ===================================================================
ct_rows = [
 [("1","idx"),("96500 11083","strong"),("Handwritten at the top of the Keyword Calls product sheet",""),("To be confirmed "+TBC,"")],
 [("2","idx"),("74289 30758","strong"),("Handwritten in the margin of a product price sheet, next to “Lenvima / Lenvat / Lenvatinib”",""),("To be confirmed "+TBC,"")],
 [("3","idx"),("89200 43471","strong"),("Handwritten on the Lead Stage / Follow-up table",""),("To be confirmed "+TBC,"")],
 [("4","idx"),("98189 92090","strong"),("Handwritten on the Lead Stage / Follow-up table",""),("To be confirmed "+TBC,"")],
]
dv_rows = [
 [("H-53, H-23 (B), H-21","strong"),("Devices / WhatsApp accounts assigned to Lakshy",""),("Things To Do sheet","")],
 [("H-22 / E-1","strong"),("Product images to be posted",""),("Day Planner","")],
 [("H-110","strong"),("Deal done (noted on the planner)",""),("Day Planner","")],
]
render(dict(code="MS-REF-04", cat="cat-reference", chip_en="Reference", chip_hi="संदर्भ",
            title_en="Contacts &amp; Devices", title_hi="संपर्क एवं डिवाइस सूची",
            sub_en="Numbers and device IDs found on the old notices", sub_hi="पुराने नोटिस से संपर्क व डिवाइस",
            control=default_control("MS-REF-04", "Internal reference"),
            folder="reference", slug="Contacts-and-Devices"),
       [f'''<h2 class="sec">Contact numbers {hi("संपर्क नंबर")}</h2>
{table([("#",""),("Number "+hi("नंबर"),""),("Found on",""),("Role / owner "+hi("भूमिका"),"")], ct_rows, "ms-table")}
<h2 class="sec">Device / account IDs {hi("डिवाइस आईडी")}</h2>
{table([("ID",""),("Use",""),("Source","")], dv_rows, "ms-table")}
{tbc_box(["The role or owner of each number is not written on the originals. Fill these in before display.",
          "Device IDs are copied as written. Confirm whether H-22 / E-1 and H-110 are device IDs."])}'''])
