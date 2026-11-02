# Mediseller SIM Lines: Combined Verdict (3 sources)

**Date:** 2 Nov 2026
**Sources:**
- `SIM_Audit_Calls.xlsx`: 4 sheets.
- `LINE_CONTROL_REPORT_2026-11-02_1635.xlsx`: 3 sheets.
- `SIM_Audit_Report.md`.

**Workbook:** `SIM_Lines_Combined_Verdict.xlsx`. One row per number, plus all evidence.
**Holder / POC names are ignored throughout.**

## How each number was judged

Every verdict is recomputed from the raw rows:
- the 210 call logs, minus 2 browser test calls;
- the 203 WhatsApp message-log rows.

The summary sheets of the sources were used only for cross-checking.

| Check | Passes when |
|---|---|
| **1. Incoming call** | A call from 94293 99495 was answered **and a person spoke**. |
| **2. Outgoing call** | The SIM called 94293 99495 at least once. |
| **3. WhatsApp** | The 31 Oct Line Control receipt shows the message was delivered, read or replied to, or the number is itself a Chatwoot WhatsApp Business API inbox. |

For WhatsApp, the 31 Oct delivery receipt is used, not what people said on the 28 Oct call. Where the two disagree, the receipt wins (9 numbers; see section 5).

## 1. Headline

**92 numbers in scope:**
- 88 numbers appear in both reports.
- 9319792627 appears only in the SIM audit.
- 3 rows are SIM serials (ICCID) with no phone number.

| Tier | Meaning | Count |
|---|---|---|
| **A** | **Fully active:** incoming ✔, outgoing ✔, WhatsApp ✔ | **16** |
| B | Calls work both ways; WhatsApp **not** working | 2 |
| C | WhatsApp ✔ plus one call direction proven | 27 |
| D | A person answered; no callback; WhatsApp not working or not checked | 13 |
| E | Call connected but nobody spoke; no callback | 5 |
| F | Never answered or called back, **but WhatsApp works** | 14 |
| G | **Dead on all checks** | 12 |
| H | Not testable (ICCID only) | 3 |

**Totals by check:**
- **Incoming proven:** 57 of 89 dialled numbers.
- **Outgoing proven:** 19.
- **WhatsApp working:** 60 of 88 checked.
- **Both call directions proven:** 18 (Tiers A and B).

## 2. ✅ The 16 numbers active on every check (Tier A)

| # | Number | S.no | Line label | Callbacks | WhatsApp evidence |
|---|---|---|---|---|---|
| 1 | 9818832983 | 2 | MS PTP 2 Riya - 1 | 1 | Replied (Normal WhatsApp) |
| 2 | 9821598055 | 6 | MS PTP 7 Rajni - 1 | 1 | Replied (Normal WhatsApp) |
| 3 | 7428930758 | 8 | MS PTP 15 Riya-2 | 1 | Replied (Normal WhatsApp) |
| 4 | 9811510507 | 12 | Prince Mediseller; MS PTP 22 Prince P | 1 | Replied (WhatsApp Business) |
| 5 | 9355043578 | 13 | MS PTP 27 Disha | 1 | Replied (Business WhatsApp) |
| 6 | 9643416119 | 16 | MS PTP 38 Riya | 4 | Replied (Normal WhatsApp) |
| 7 | 8851839341 | 21 | MS CC 3 | 1 | Replied |
| 8 | 7011470814 | 33 | MS CC 30 Ali Kaif | 1 | Replied (Business WhatsApp) |
| 9 | 8178458712 | 36 | MS CC 47 Ali | 1 | Is Chatwoot inbox 4 (WhatsApp Business API) |
| 10 | 8700128327 | 40 | Telegram; MS WFH 4 Abhishek - Jaipur | 1 | Read |
| 11 | 7065016951 | 43 | HR | 1 | Replied |
| 12 | 9599618064 | 58 | ATHAR; NEW CALL PRINCE | 1 | Replied (Business WhatsApp) |
| 13 | 9650011083 | 59 | Mediseller 2 | 1 | Replied (Business WhatsApp) |
| 14 | 9667733026 | 60 | RAJNI (OLD BUSINESS) | 1 | Replied (Business WhatsApp + auto-reply) |
| 15 | 9999891980 | 80 | (personal) | 3 | Replied |
| 16 | 9310355936 | 90 | (Line Control says "Typo entry – Delete") | 1 | Read |

⚠️ **9310355936 is a live, fully working number.** Line Control marks it for deletion. Find out who holds it first.

## 3. Calls work both ways, but WhatsApp does not (Tier B)

| Number | S.no | Label | WhatsApp |
|---|---|---|---|
| 8882650886 | 54 | AKASH | The account exists but is not reachable: Meta error 131026 twice, and the WhatsApp Web text stayed at 1 tick. |
| 9711165044 | 61 | AKASH | Not on WhatsApp. |

## 4. Everything else, by tier

**C: WhatsApp working plus one call direction (27).** All but one were answered by a person and never called back.
- **Incoming answered, no callback (26):** 7410510555, 7065016949, 9811861174, 9354991553, 9643341492, 9818992090, 9654412847, 8130276541, 8287514223, 8851898140, 7303072644, 8587011873, 9818099875, 9773529259, 7065016950, 7065016952, 8178461147, 9220266331, 9355043579, 9811167613, 9811415354, 9811652596, 9999665044, 7292078063, 8076724071, 8527619560.
- **Called back but never answered (1):** 9310355390. Line Control marks it as a typo.
- **To finish:** one callback from each of the 26 SIMs moves it to Tier A.

**D: A person answered, no callback, WhatsApp not working (13).**
- **WhatsApp account exists but is not reachable:** 8587017039, 7011656137, 9354914821, 7011103913, 9625547985, 7428275547, 9818068983, 9521655249, 8373980017, 9310355396, 9650400943.
- **Not on WhatsApp:** 9355043580.
- **WhatsApp never checked:** 9319792627.

**E: Connected, nobody spoke (5).**
- **WhatsApp working:** 9910092910 (read), 9717881829 (delivered), 9582220198 (delivered).
- **WhatsApp not reachable:** 9310032351, 9355043577.

**F: Calls dead, WhatsApp alive (14).** WhatsApp works, but these SIMs never answered or called back. The SIM may not be in a phone.
- **Chatwoot API inboxes:** 9355043576 (inbox 5), 7428930419 (inbox 6), 8287233742 (inbox 1).
- **Replied:**
  - 8448686502
  - 8373990061
  - +852 9307 7341: auto-reply reads "Benoquin Creams", another business.
- **Read:** 9220139200, 9650400894, 9650100943 (marked "typo").
- **Delivered:** 7303939862, 8375891491, 8178461146, 8920043471, 9217589778 (marked "switched off").

**G: Dead on all checks (12).** Never answered, never called back, WhatsApp not working.
- **Not on WhatsApp:**
  - 7065016953, 8076990415, 9811768778, 8929569566, 7754543309.
  - 7827472731: the last call attempt returned **failed**, so the number may not exist.
- **WhatsApp account exists but is not reachable:** 9870525466, 8700321810, 9311457981, 7428275548, 7303076244, +852 9330 1274.

**H: Not testable (3).** ICCID 89918720400702493469, ICCID 89910273117154088880, ICCID 89910273117115018158.

## 5. Errors and conflicts found in the source documents

17 items in total. All are listed with evidence in the workbook's *Source errors & conflicts* sheet. The ones that change a verdict:

1. **SIM audit misclassified 2 lines.** It lists 9711165044 and 9310355936 as "outgoing OK, incoming not confirmed". In both cases a person spoke on an answered call on 29 Oct. Both lines are proven both ways, so the audit's 16 / 3 split is really **18 / 1**.
2. **The SIM audit Summary sheet says 0 inbound logs.** There are 24.
3. **Line Control marks 3 live numbers "Typo entry – Delete":**
   - 9310355936 passes all 3 checks.
   - 9310355390 called back, and its WhatsApp was read.
   - 9650100943 had its WhatsApp read.
4. **Line Control state is contradicted by the calls:**
   - 8587017039 and 7011103913 say "Nobody answered", but a person answered both.
   - 9625547985 says "Switched off", but a person answered it on 28 Oct.
5. **Line Control says 6 lines haven't replied yet, but they did.** 9355043578, 9818992090, 8287514223, 8851898140, 7303072644 and 9773529259 replied on 31 Oct. Their replies were two-line messages that the parser missed.
6. **The .md report gets the international numbers partly wrong.** It says both were dialled without +852, but +852 9307 7341 was dialled correctly. Each was tried only once.
7. **The .md report says typo billers 9650100943 and 7303076244 are "not real lines".** Both have WhatsApp accounts.
8. **The .md report says 9217589778 is "still dead".** Its WhatsApp was delivered.
9. **The 28 Oct self-report conflicts with the 31 Oct receipt on 9 numbers:**
   - 6 said WhatsApp was ON but it isn't reachable: 9355043580, 9354914821, 9818068983, 9521655249, 9310355396, 9650400943.
   - 3 said it was OFF but it is reachable: 9643341492 (API inbox), 9818099875, 9773529259.

## 6. Limits of this analysis

- **WhatsApp working ≠ SIM in a phone.** WhatsApp keeps running over Wi-Fi after the SIM is removed. API inboxes need no phone at all. This is why Tier F needs a physical check.
- **"Not reachable" (Tier W5) is a snapshot from 31 Oct, around 13:30.** These accounts exist; the phone was offline or the app was outdated at that moment.
- **Outgoing is unproven for 26 SIMs only because nobody called back.** That is not evidence the outgoing line is broken.
