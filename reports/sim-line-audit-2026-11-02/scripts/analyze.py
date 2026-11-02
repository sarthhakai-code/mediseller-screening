"""Combine SIM_Audit_Calls.xlsx, LINE_CONTROL_REPORT xlsx and SIM_Audit_Report.md into one per-number view.

Everything is recomputed from the raw rows ('All calls' and 'Message log'); the per-SIM and summary
sheets of the source files are only used for cross-checking.
"""
import collections
import json
import re
import sys

import openpyxl

SIM_XLSX, LC_XLSX, OUT_JSON = sys.argv[1], sys.argv[2], sys.argv[3]

OUR_NUMBER = "9429399495"


def norm(num):
    """Return a canonical key: 10 digits for Indian numbers, 852XXXXXXXX for Hong Kong."""
    if num is None:
        return None
    s = str(num)
    if s.startswith("ICCID"):
        return s
    d = re.sub(r"\D", "", s)
    if d.startswith("852") and len(d) == 11:
        return d
    if d.startswith("52") and len(d) == 10:  # +852 with the leading 8 lost
        return "8" + d
    if d.startswith("91") and len(d) == 12:
        return d[2:]
    if len(d) == 10:
        return d
    return d or s


def pretty(key):
    if key.startswith("852") and len(key) == 11:
        return f"+852 {key[3:7]} {key[7:]}"
    return key


# ---------------- SIM audit workbook ----------------
wb = openpyxl.load_workbook(SIM_XLSX, data_only=True)
rows = list(wb["All calls"].iter_rows(values_only=True))
H = {c: i for i, c in enumerate(rows[0])}
calls = [dict((c, (r[i] if r[i] != "None" else None)) for c, i in H.items()) for r in rows[1:]]

SILENT_RE = re.compile(r"no user speech|only bot greeting|silent line|^silence;|caller silent", re.I)

per = collections.defaultdict(lambda: {
    "out": [], "inb": [], "snos": set(), "line_names": set(), "names": [],
})

for c in calls:
    if c["from_number"] == "Web Call":
        continue  # browser test calls, no SIM involved
    d = c["direction"]
    if d == "outbound":
        key = norm(c["to_number"])
    else:
        key = norm(c["from_number"])
    p = per[key]
    gist = c["transcript_gist"] or ""
    if c["call_status"] != "completed":
        outcome = c["call_status"]  # no-answer / failed
    elif c["picked_up"] == "no" or SILENT_RE.search(gist):
        outcome = "silent"
    else:
        outcome = "human"
    rec = {
        "id": c["call_log_id"], "when": c["call_date_time"], "status": c["call_status"],
        "outcome": outcome, "dur": c["duration_sec"], "campaign": c["bulk_call_name"],
        "agent": c["agent_id"], "gist": gist, "dialled_as": c["to_number"],
        "cb": c["callback_agreed_actual"],
    }
    (p["out"] if d == "outbound" else p["inb"]).append(rec)
    if c["sno"]:
        p["snos"].add(str(c["sno"]))
    if c["line_name"]:
        p["line_names"].add(c["line_name"])

# per-SIM sheet (for cross-checks and 28 Oct WhatsApp self-report)
ps_rows = list(wb["Per SIM"].iter_rows(values_only=True))
PSH = {c: i for i, c in enumerate(ps_rows[0])}
per_sim_sheet = {}
for r in ps_rows[1:]:
    per_sim_sheet[norm(r[PSH["Number"]])] = {c: r[i] for c, i in PSH.items()}

# ---------------- Line Control workbook ----------------
lc = openpyxl.load_workbook(LC_XLSX, data_only=True)
lrows = list(lc["Lines & actions"].iter_rows(values_only=True))
LH = {c: i for i, c in enumerate(lrows[0])}
lines = {}
for r in lrows[1:]:
    lines[norm(r[LH["Number"]])] = {c: r[i] for c, i in LH.items()}

mrows = list(lc["Message log"].iter_rows(values_only=True))
MH = {c: i for i, c in enumerate(mrows[0])}
msgs = collections.defaultdict(list)
for r in mrows[1:]:
    msgs[norm(r[MH["Number"]])].append({c: r[i] for c, i in MH.items()})

CHATWOOT = {  # numbers that are themselves Chatwoot WhatsApp Business API senders
    "8287233742": "inbox 1", "7065016952": "inbox 2", "8178458712": "inbox 4",
    "9355043576": "inbox 5", "7428930419": "inbox 6", "9643341492": "inbox 7",
}


def whatsapp_status(key):
    line = lines.get(key)
    if line is None:
        return "W7", "Not checked (not in Line Control)", ""
    res = line["Our result"] or ""
    ml = msgs.get(key, [])
    statuses = [m["Status"] for m in ml if m["Message"] != "REPLY from line"]
    replies = [m["Exact text"] for m in ml if m["Message"] == "REPLY from line"]
    if res.startswith("ACTIVE - runs Chatwoot"):
        return "W4", "Working - this number IS a Chatwoot WhatsApp Business API inbox", CHATWOOT.get(key, "")
    if res.startswith("ACTIVE"):
        human = [x for x in replies if not re.match(r"(\*?Hello|Welcome|Hello!)", x or "")]
        auto = [x for x in replies if re.match(r"(\*?Hello|Welcome|Hello!)", x or "")]
        if human:
            return "W1", "Working - delivered, read and replied", "; ".join(x.replace("\n", " ") for x in human)
        if auto:
            return "W2", "Working - delivered (auto-reply only)", auto[0].split("\n")[0]
        if "read" in statuses:
            return "W2", "Working - read (blue ticks), no reply", ""
        return "W3", "Working - delivered (2 ticks), not read", ""
    if res.startswith("HAS WHATSAPP"):
        return "W5", "Account exists but NOT reachable (131026 x2; personal text stuck at 1 tick)", ""
    if res.startswith("NOT RECEIVED YET"):
        return "W5", "Account exists but NOT reachable (sent, never delivered - phone off / no data)", ""
    if res.startswith("NOT ON WHATSAPP"):
        return "W6", "Not on WhatsApp", ""
    if res.startswith("Not checked"):
        return "W7", "Not checked (ICCID only, no phone number)", ""
    return "W?", res, ""


out = []
all_keys = set(per) | set(lines)
for key in all_keys:
    p = per.get(key, {"out": [], "inb": [], "snos": set(), "line_names": set()})
    line = lines.get(key, {})
    ps = per_sim_sheet.get(key, {})
    o = sorted(p["out"], key=lambda x: x["when"])
    i = sorted(p["inb"], key=lambda x: x["when"])
    human = [x for x in o if x["outcome"] == "human"]
    silent = [x for x in o if x["outcome"] == "silent"]
    failed = [x for x in o if x["outcome"] == "failed"]
    if key.startswith("ICCID"):
        incoming = "Not dialled (no number)"
    elif not o:
        incoming = "Not dialled"
    elif human:
        incoming = "YES - answered by a person"
    elif silent:
        incoming = "PARTIAL - connected, nobody spoke"
    else:
        incoming = "NO - never answered" + (" (last attempt FAILED)" if failed else "")
    outgoing = f"YES - called us back x{len(i)}" if i else ("NO callback" if o else "Not tested")
    wcode, wtext, wdetail = whatsapp_status(key)
    wa_ok = wcode in ("W1", "W2", "W3", "W4")
    inc_ok = bool(human)
    out_ok = bool(i)

    # overall tier
    if inc_ok and out_ok and wa_ok:
        tier = "A"
    elif inc_ok and out_ok:
        tier = "B"
    elif (inc_ok or out_ok) and wa_ok:
        tier = "C"
    elif inc_ok or out_ok:
        tier = "D"
    elif silent and wa_ok:
        tier = "E"
    elif silent:
        tier = "E"
    elif wa_ok:
        tier = "F"
    elif key.startswith("ICCID"):
        tier = "H"
    else:
        tier = "G"

    sno = sorted(p["snos"] | ({str(ps["S.no"])} if ps.get("S.no") else set()), key=lambda s: int(s))
    out.append({
        "key": key, "number": pretty(key) if not key.startswith("ICCID") else key,
        "sno": ", ".join(sno),
        "label": line.get("Label") or ps.get("Line name") or "",
        "office": line.get("Office"),
        "category": ps.get("Category"),
        "lc_state": line.get("Line Control state"), "lc_decision": line.get("Line Control decision"),
        "lc_result": line.get("Our result"), "lc_priority": line.get("Priority"),
        "out_attempts": len(o), "out_human": len(human), "out_silent": len(silent),
        "out_noans": len([x for x in o if x["outcome"] == "no-answer"]), "out_failed": len(failed),
        "out_detail": " | ".join(f"{x['when'][5:16]} {x['outcome']}" for x in o),
        "dialled_as": sorted({x["dialled_as"] for x in o}),
        "inb": len(i), "inb_detail": " | ".join(f"{x['when'][5:16]} {x['outcome']} {x['dur']}s" for x in i),
        "incoming": incoming, "outgoing": outgoing, "inc_ok": inc_ok, "out_ok": out_ok,
        "wa_code": wcode, "wa": wtext, "wa_detail": wdetail, "wa_ok": wa_ok,
        "wa_self_28oct": ps.get("WhatsApp active (28 Oct)"),
        "lc_wa_type": line.get("WhatsApp type (reported)"),
        "msgs": [f"{m['When']} {m['Channel / sent from'].split(' (')[0]} {m['Message'].split(' (')[0]} -> {m['Status']}" for m in msgs.get(key, [])],
        "persim_result": ps.get("Result"), "persim_cb": ps.get("Callbacks received"),
        "tier": tier,
        "gists": [x["gist"] for x in o + i if x["gist"]],
    })

json.dump(out, open(OUT_JSON, "w"), ensure_ascii=False, indent=1, default=list)
print(len(out), "numbers")
print(collections.Counter(r["tier"] for r in out))
print(collections.Counter(r["wa_code"] for r in out))
