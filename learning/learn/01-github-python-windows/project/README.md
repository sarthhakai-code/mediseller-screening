# Mini project: Direct Claude Code to clean a messy leads file

This is a warm-up for **List 2 #7** (Leads → clean / churn / distribute). In Lesson 02 it grows into a real pipeline.

## The input
[`sample_leads.csv`](sample_leads.csv) contains 15 fake inquiries, the kind that arrive from IndiaMART, TradeIndia, the website and WhatsApp. It is deliberately messy: duplicate people under different phone formats, mixed capitalisation, a blank row, a test entry, and a lead with no contact details.

## Your task
You **don't** write the code. You direct Claude Code.

1. In PowerShell, from this `project` folder (with `.venv` active), run `claude`.
2. Paste this prompt (or write your own, which is even better practice):

> Read sample_leads.csv. Write a Python script `clean_leads.py` using pandas that:
> 1. removes fully blank rows,
> 2. normalises phone numbers to international format with digits only (assume India +91 if no country code; drop a leading 0),
> 3. lowercases emails and title-cases names,
> 4. treats two rows as the same person if phone OR email matches, merges them keeping the earliest date and combining sources,
> 5. flags junk/test rows and rows with no phone and no email into a separate file,
> 6. saves `leads_clean.csv` and `leads_flagged.csv`, and prints a summary.
> Explain each step in simple language for a non-coder, then run it.

3. Approve its actions as it asks. Read its explanations.

## Check the result yourself (the most important skill)
The correct summary is:

| Check | Expected |
|---|---|
| Blank rows removed | 1 |
| Duplicates merged | 4 |
| Clean leads in `leads_clean.csv` | **8** |
| Flagged rows in `leads_flagged.csv` | **2** (the "test" row and John Smith with no contact) |
| Priya Nair's phone | `919847012345` |
| Rahul Sharma's sources | IndiaMART + TradeIndia |

If any number is different, **don't fix the code yourself**. Tell Claude Code: *"Expected 8 clean leads but got X. Find out why and fix it."* That conversation is the real lesson.

## Bonus (optional)
Ask Claude Code: *"Add a column `country` worked out from the phone code, and sort by country."*

When done, commit your work:
```powershell
git add .
git commit -m "Lesson 01 mini project: lead cleaner"
git push
```
