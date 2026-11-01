# Lesson 01: Hands-on exercise (Windows)

If anything errors, **take a screenshot and send it to Claude**. Errors are normal and part of learning.

## Step 0: Open PowerShell
Press the **Windows key**, type `PowerShell`, and open **Windows PowerShell** (normal mode, not Admin).

## Step 1: Install Git, Python and VS Code (one command each)
Copy-paste each line and press Enter. Accept any prompts.
```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.13 -e
winget install --id Microsoft.VisualStudioCode -e
```
Then **close PowerShell and open it again** so it picks up the new tools.

Check that they installed:
```powershell
git --version
python --version
```
- [ ] `git --version` shows something like `git version 2.x`
- [ ] `python --version` shows `Python 3.13.x`

> If `python` opens the Microsoft Store instead: go to Settings → Apps → Advanced app settings → App execution aliases, and turn **off** the two "python" entries. Reopen PowerShell.

## Step 2: Allow scripts to run (one-time)
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```
Type `Y` if asked. This lets virtual environments and installers run.

## Step 3: Install Claude Code
```powershell
irm https://claude.ai/install.ps1 | iex
```
Reopen PowerShell, then:
```powershell
claude --version
claude
```
The first run opens a browser to log in with your Claude account.
- [ ] `claude` opens and you're logged in. Type `/exit` to leave.

## Step 4: Tell Git who you are (one-time)
```powershell
git config --global user.name "Your Name"
git config --global user.email "sarthhak.ai@gmail.com"
```

## Step 5: Clone your first repo (this tracker)
```powershell
cd $HOME\Documents
git clone https://github.com/sarthhakai-code/mediseller-screening.git
cd mediseller-screening
git checkout ccr-d088458d-yh1ygx
dir learning
```
A browser window may pop up asking you to sign in to GitHub. Approve it.
- [ ] You can see `README.md`, `log.md`, `learn` etc. inside `learning`
- [ ] Open the folder in VS Code: `code .`

## Step 6: Your first Python library in a virtual environment
```powershell
cd learning\learn\01-github-python-windows\project
python -m venv .venv
.venv\Scripts\activate
pip install pandas
python -c "import pandas; print('pandas works, version', pandas.__version__)"
```
- [ ] You see `(.venv)` at the start of the line
- [ ] It prints `pandas works, version ...`

Now go to the [mini project](project/README.md).
