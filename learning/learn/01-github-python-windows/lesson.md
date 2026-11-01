# Lesson 01: GitHub, Python & Claude Code on Windows

**List 1 item:** #3 "GitHub repo → loading / Python libraries etc."
**Time:** ~2–3 sessions (5–7 hrs total) · **Goal:** set up a working AI-builder toolkit on Windows and understand what each piece does. You don't need to learn to code.

---

## Part 1: Explainer (read, ~15 min)

### The 5 tools and what they do

| Tool | Analogy | Why you need it |
|---|---|---|
| **Terminal** (PowerShell) | A chat window with your computer, typing commands instead of clicking | Every AI tool (Claude Code, Codex, OpenClaw) runs here |
| **Git** | "Track changes" + "Save as version" for a whole folder | Lets you download (clone) projects and undo mistakes |
| **GitHub** | Google Drive for Git folders (called *repositories* or *repos*) | Where code lives online; where our tracker lives |
| **Python** | The language most AI and automation tools are written in | To *run* scripts that AI writes for you |
| **Claude Code** | A senior developer who sits inside your terminal | You describe what you want; it writes, runs and fixes the code |

Plus **VS Code**, a free editor for looking at files. Think of it as Notepad with superpowers.

### Key words you'll hear constantly

- **Repo (repository):** a project folder tracked by Git.
- **Clone:** download a repo to your PC.
- **Commit:** a saved checkpoint with a message ("added lead cleaner").
- **Push / Pull:** upload your commits to GitHub / download others' changes.
- **Branch:** a parallel copy to try changes without breaking the main version. (Our tracker currently lives on branch `ccr-d088458d-yh1ygx`.)
- **Library / package:** ready-made code someone else wrote, e.g. `pandas` for spreadsheets. You install it with `pip install pandas`.
- **requirements.txt:** the shopping list of libraries a project needs. `pip install -r requirements.txt` installs them all.
- **Virtual environment (venv):** a separate box of libraries for each project, so projects don't clash.
- **README.md:** the instruction manual at the top of every repo. **Always read it first.**

### How to "load" any GitHub project (the universal recipe)
1. Read the README. Look for "Installation" or "Getting started".
2. `git clone <url>` → `cd <folder>`
3. `python -m venv .venv` → `.venv\Scripts\activate`
4. `pip install -r requirements.txt`
5. Run the command the README says (e.g. `python main.py`)
6. Stuck? Run `claude` in that folder and say: *"Read the README and get this project running on my Windows PC. Explain each step."*

### Your role as an AI-directed builder
You are the **product owner**, not the coder. Your job:
1. **Describe** the outcome clearly: what goes in, what should come out, and an example.
2. **Check** the result against something you know is true.
3. **Ask why** whenever you don't understand. Claude Code will explain.
4. **Approve or reject** its actions. It asks before running commands.

---

## Part 2: Hands-on setup → see [exercise.md](exercise.md)
## Part 3: Mini project → see [project/README.md](project/README.md)
## Part 4: Quiz → see [quiz.md](quiz.md)

**Done when:** all checkboxes in exercise.md are ticked, the mini project output matches the expected numbers, and you've answered the quiz. Then tell Claude: *"Lesson 01 done"* plus your quiz answers.
