# Session log

Newest first. Claude reads this at the start of every session.

## 2026-11-02: Session 2 (phone app + page 4)
**Done**
- Built the phone app (https://claude.ai/artifact/B2g2W6TWWqD9jFfQXC8tpR). It syncs statuses, Lesson 01 steps, quiz answers and the inbox to the artifact database.
- Added notebook page 4 (Learn 12 + Explore 14) as lists L4 and L5.
  - **Learn p4:** all items current.
  - **Explore p4:** pharma/export, markets/sectors and idea development are current. NFTs, Metaverse, DEX/DeFi, Block/Square/Indian crypto, Blockchain/Web3 and Thearn.com are parked.
- **Decisions:**
  - The finance track stays after the AI weeks, in this order: personal finance → technical analysis → order types → swing → F&O → algo. Crypto comes after that.
  - Lessons get added one at a time, not as outlines up front.

**Next**
- Same as Session 1: you do Lesson 01. Claude writes brief #1 when asked, then Lesson 02.
- To read progress: ArtifactData list `items`, get `progress/lesson01-steps` and `progress/lesson01-quiz`, list `inbox`.

## 2026-11-01: Session 1 (setup)
**Done**
- Read all 3 notebook pages (Learn, Grow, Explore) and transcribed them into the [dashboard](README.md).
- Six rounds of planning questions answered. Key decisions:
  - **Track:** "AI-directed builder". You don't write code; you learn to direct, run and check AI-written code.
  - **Logistics:** 5–8 hrs/week on a Windows PC. You have a paid ChatGPT plan and a broker API; no VPS or Obsidian yet. Budget ₹10k+/month.
  - **Focus:** AI skills first. List 2 items are the projects. List 3 gets one brief a week.
  - **Starting points:** F&O from zero, paper trading only. AI consultancy is still an idea.
  - **Handwriting fixes:** Monoben = Monobenzone. Nuclear = SMRs + SMEs. Khsm / Veshti. Insulincart = website name.
- The tracker lives in `learning/` on branch `ccr-d088458d-yh1ygx` of `mediseller-screening` because the `ai-learning-journey` repo doesn't exist yet.
- Lesson 01 written.

**Next**
1. You: do [Lesson 01](learn/01-github-python-windows/lesson.md) (setup + exercise + mini project + quiz). Report back any errors as screenshots.
2. You (optional): create an empty GitHub repo `ai-learning-journey`. Claude moves this folder there.
3. Claude: List 3 brief #1 (medicine brands: generics, semaglutide, export best-sellers, with a compliance check).
4. Then Lesson 02: Agentic AI basics + the lead-pipeline project.
