"""Build the combined workbook from combined.json."""
import collections
import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

data = json.load(open(sys.argv[1]))
OUT = sys.argv[2]

TIERS = {
    "A": ("FULLY ACTIVE", "Incoming answered + called us back + WhatsApp working", "C6EFCE"),
    "B": ("CALLS ACTIVE, NO WHATSAPP", "Incoming answered + called us back; WhatsApp not working", "E2EFDA"),
    "C": ("WHATSAPP OK, ONE CALL DIRECTION PROVEN", "WhatsApp working + only one call direction proven", "FFF2CC"),
    "D": ("INCOMING ONLY, NO WHATSAPP", "Person answered; no callback; WhatsApp not working / not checked", "FCE4D6"),
    "E": ("CONNECTED BUT SILENT", "Call connected, nobody spoke, no callback", "F8CBAD"),
    "F": ("CALLS DEAD, WHATSAPP ALIVE", "Never answered, never called back - but WhatsApp working", "DDEBF7"),
    "G": ("DEAD ON ALL CHECKS", "Never answered, never called back, WhatsApp not working", "FF9999"),
    "H": ("NOT TESTABLE", "SIM serial (ICCID) only - no phone number", "D9D9D9"),
}
WA_OK = {"W1", "W2", "W3", "W4"}
WA_SHORT = {
    "W1": "YES - replied", "W2": "YES - read", "W3": "YES - delivered",
    "W4": "YES - Chatwoot API inbox", "W5": "NO - account exists, not reachable",
    "W6": "NO - not on WhatsApp", "W7": "NOT CHECKED",
}

thin = Side(style="thin", color="BFBFBF")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HFILL = PatternFill("solid", fgColor="1F3864")
HFONT = Font(bold=True, color="FFFFFF")


def sheet(wb, title, headers, rows, widths, fill_col=None):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in ws[1]:
        c.fill, c.font, c.border = HFILL, HFONT, BORDER
        c.alignment = Alignment(wrap_text=True, vertical="center")
    for r in rows:
        ws.append(r)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.border = BORDER
            c.alignment = Alignment(wrap_text=True, vertical="top")
        if fill_col is not None:
            t = row[fill_col].value
            if t in TIERS:
                for c in row:
                    c.fill = PatternFill("solid", fgColor=TIERS[t][2])
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "B2" if title != "Read me" else None
    if len(rows):
        ws.auto_filter.ref = ws.dimensions
    return ws


def sort_key(r):
    s = r["sno"].split(",")[0] if r["sno"] else "999"
    return (r["tier"], int(s), r["key"])


data.sort(key=sort_key)
wb = Workbook()
wb.remove(wb.active)

# ---------- Read me ----------
counts = collections.Counter(r["tier"] for r in data)
ws = wb.create_sheet("Read me")
lines = [
    ["Mediseller SIM lines - combined verdict (all 3 sources)", ""],
    ["Built", "2 Nov 2026, from SIM_Audit_Calls.xlsx (All calls, Per SIM, Follow-up, Summary), "
              "LINE_CONTROL_REPORT_2026-11-02_1635.xlsx (Summary, Lines & actions, Message log) and SIM_Audit_Report.md"],
    ["Method", "Every verdict is recomputed from the raw rows: 208 SIM call logs (2 browser test calls excluded) "
               "and 203 WhatsApp message-log rows. Per-SIM/summary sheets were used only to cross-check. POC / holder names ignored."],
    ["", ""],
    ["Check", "Rule used"],
    ["1. Incoming call", "YES = at least one outbound call from 94293 99495 was answered and a person spoke. "
                         "PARTIAL = connected but nobody spoke. NO = no-answer / failed on every attempt."],
    ["2. Outgoing call", "YES = the SIM placed at least one call to 94293 99495 (inbound log from that number). "
                         "Any connected inbound call proves outgoing, even if the caller stayed silent."],
    ["3. WhatsApp", "From the 31 Oct Line Control check (objective delivery receipts), not from what people said on the 28 Oct call. "
                    "WORKING = replied / read / delivered, or the number is itself a Chatwoot WhatsApp Business API inbox. "
                    "NOT WORKING = Meta error 131026 + WhatsApp Web text stuck at 1 tick, or 'sent' never delivered, or 'isn't on WhatsApp'."],
    ["", ""],
    ["Tier", "Meaning", "Numbers"],
]
for t, (name, desc, _) in TIERS.items():
    lines.append([f"{t} - {name}", desc, counts.get(t, 0)])
lines += [
    ["Total", "", len(data)],
    ["", ""],
    ["Caveat", "WhatsApp working does NOT prove the SIM itself is in a phone: WhatsApp keeps running on a device over Wi-Fi/data "
               "after the SIM is removed, and Chatwoot API inboxes need no phone at all. Tier F numbers need a physical check."],
]
for l in lines:
    ws.append(l)
ws["A1"].font = Font(bold=True, size=14)
for r in (5, 10):
    for c in ws[r]:
        c.font = Font(bold=True)
for row in ws.iter_rows(min_row=2):
    for c in row:
        c.alignment = Alignment(wrap_text=True, vertical="top")
for row in ws.iter_rows(min_row=11, max_row=10 + len(TIERS)):
    t = row[0].value[0]
    for c in row:
        c.fill = PatternFill("solid", fgColor=TIERS[t][2])
ws.column_dimensions["A"].width = 44
ws.column_dimensions["B"].width = 110
ws.column_dimensions["C"].width = 10

# ---------- Final verdict ----------
hdr = ["Tier", "Verdict", "Number", "S.no", "Line label", "Incoming call", "Outgoing call (callback)",
       "WhatsApp (31 Oct objective)", "WhatsApp detail", "Checks passed (of 3)",
       "Call attempts", "Answered by person", "Silent connects", "No-answer", "Failed",
       "Line Control state", "Line Control decision", "Next action"]


def action(r):
    t = r["tier"]
    if t == "A":
        return "None - line fully proven."
    if t == "B":
        return "Line works for calls. Fix or confirm WhatsApp (open app, update, accept terms) if it should have WhatsApp."
    if t == "C":
        if r["out_ok"]:
            return "Identify holder; one answered call would complete the proof."
        return "Ask holder to place one call to 94293 99495 from this SIM to prove outgoing."
    if t == "D":
        if r["wa_code"] == "W7":
            return "Ask for one callback; run WhatsApp check (not in Line Control)."
        if r["wa_code"] == "W6":
            return "Ask for one callback. No WhatsApp on number - keep for calls/OTP only or set up WhatsApp."
        return "Ask for one callback. Have holder open WhatsApp with data on, update app, accept terms; recheck."
    if t == "E":
        return "Re-dial in working hours / ask holder to call back."
    if t == "F":
        return "Physically locate SIM: WhatsApp runs somewhere, but the SIM never answers or calls."
    if t == "G":
        return "Locate SIM / check recharge; if not found, stop payment and retire the line."
    return "Find the phone number for this SIM serial and add it to Line Control."


rows = []
for r in data:
    passed = int(r["inc_ok"]) + int(r["out_ok"]) + int(r["wa_code"] in WA_OK)
    rows.append([
        r["tier"], TIERS[r["tier"]][0], r["number"], r["sno"], r["label"], r["incoming"], r["outgoing"],
        WA_SHORT[r["wa_code"]], (r["wa"] + (f" [{r['wa_detail']}]" if r["wa_detail"] else "")),
        passed, r["out_attempts"], r["out_human"], r["out_silent"], r["out_noans"], r["out_failed"],
        r["lc_state"], r["lc_decision"], action(r),
    ])
sheet(wb, "Final verdict", hdr, rows,
      [5, 26, 17, 6, 30, 30, 22, 26, 50, 9, 8, 9, 8, 8, 7, 26, 24, 55], fill_col=0)

# ---------- Fully active ----------
fa = [[r["number"], r["sno"], r["label"], f"{r['out_human']} of {r['out_attempts']}",
       r["inb"], WA_SHORT[r["wa_code"]], r["inb_detail"]] for r in data if r["tier"] == "A"]
sheet(wb, "Fully active (A)", ["Number", "S.no", "Line label", "Answered calls", "Callbacks received",
                               "WhatsApp", "Callback times (31 Oct / 1 Nov)"], fa, [16, 6, 34, 14, 10, 26, 60])

# ---------- WhatsApp ----------
wa_rows = []
for r in sorted(data, key=lambda r: (r["wa_code"], sort_key(r))):
    wa_rows.append([r["number"], r["sno"], WA_SHORT[r["wa_code"]], r["wa"], r["wa_detail"],
                    r["wa_self_28oct"], r["lc_wa_type"], "\n".join(r["msgs"])])
ws = sheet(wb, "WhatsApp status", ["Number", "S.no", "WhatsApp working?", "Evidence (31 Oct)", "Reply / inbox",
                                   "Said on 28 Oct call", "WA type (Line Control)", "Message log (all attempts)"],
           wa_rows, [16, 6, 30, 55, 34, 10, 18, 90])
for row in ws.iter_rows(min_row=2):
    ok = str(row[2].value).startswith("YES")
    no = str(row[2].value).startswith("NO")
    fill = "C6EFCE" if ok else ("FFC7CE" if no else "D9D9D9")
    row[2].fill = PatternFill("solid", fgColor=fill)

# ---------- Call evidence ----------
ev = []
for r in data:
    if not r["out_attempts"] and not r["inb"]:
        continue
    ev.append([r["number"], r["sno"], r["out_detail"], r["inb_detail"], ", ".join(r["dialled_as"]),
               "\n".join(f"- {g}" for g in r["gists"])])
sheet(wb, "Call evidence", ["Number", "S.no", "Outbound attempts (date time outcome)",
                            "Inbound callbacks (date time outcome duration)", "Dialled as", "Transcript gists"],
      ev, [16, 6, 50, 45, 18, 110])

# ---------- Conflicts & corrections ----------
conf = json.load(open(sys.argv[3]))
sheet(wb, "Source errors & conflicts", ["#", "Source", "What the source says", "What the raw data shows", "Impact"],
      conf, [4, 26, 55, 70, 45])

# ---------- Self-report vs objective ----------
sr = []
for r in data:
    s = r["wa_self_28oct"]
    ok = r["wa_code"] in WA_OK
    if s == "yes" and not ok and r["wa_code"] != "W7":
        sr.append([r["number"], r["sno"], "Said WhatsApp is ON", WA_SHORT[r["wa_code"]], "Trust 31 Oct receipt: WhatsApp is not reachable now"])
    elif s == "no" and ok:
        sr.append([r["number"], r["sno"], "Said WhatsApp is OFF", WA_SHORT[r["wa_code"]] + (f" ({r['wa_detail']})" if r["wa_detail"] else ""),
                   "Trust 31 Oct receipt: WhatsApp is reachable" + (" (Business API inbox - no WhatsApp app on the phone)" if r["wa_code"] == "W4" else "")])
sheet(wb, "28 Oct vs 31 Oct WhatsApp", ["Number", "S.no", "28 Oct call (person said)", "31 Oct Line Control (receipt)", "Resolution"],
      sr, [16, 6, 24, 40, 70])

wb.save(OUT)
print("saved", OUT, counts, "self-report conflicts", len(sr))
