# ✨ AI Timesheet Editor (VS Code & Antigravity IDE Extension)

> **Automate your daily 8-hour timesheets and worklogs directly from your Git commit history and branch activity.**

---

## 🚀 Overview

**AI Timesheet Editor** is a light, fast, and feature-rich extension built for **Antigravity IDE** and **VS Code**. It analyzes your Git commits, staged changes, and unstaged work to generate structured daily timesheet entries formatted with Ticket IDs, breakdown of tasks, estimated hours, and status.

Whether you have a **Gemini API Key** or want to use web-based AI tools (ChatGPT, Claude, Gemini Web) without an API key, this extension has you covered!

---

## 🌟 Key Features & Highlights

- **🤖 Dual AI Modes**:
  - **AI Mode (Direct Gemini API)**: Generates a complete daily timesheet directly inside the editor using lightweight Google Gemini REST endpoints with fast fallback models (`gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-1.5-pro`).
  - **Non-AI Mode (Prompt Copy)**: **No API Key Required!** Extracts your active Git branch ID and changes, formats a structured instruction prompt, and gives you a 1-click **Copy Prompt** button to paste into ChatGPT, Claude, or DeepSeek.

- **⏱️ Configurable Work Hours**:
  - Set custom target hours (e.g. `8.0`, `4.0`, `6.0`, `7.5`).
  - The AI proportionally distributes your hours across active tasks based on commit volume and diff sizes.

- **🕒 Configurable Timeframe Window**:
  - Filter your Git history using the dropdown selector:
    - **`Today (Since Midnight)`** *(Default)*
    - **`Last 8 Hours`**
    - **`Last 12 Hours`**
    - **`Last 24 Hours`**
    - **`Last 48 Hours`**
    - **`Last 7 Days`**

- **🏷️ Smart Task Status Classification**:
  - **`[Status: Done]`**: Automatically assigned to work already committed to Git.
  - **`[Status: Currently Working On]`**: Automatically assigned to staged or unstaged pending modifications.

- **📁 Auto-Detect Active Project Directory**:
  - Click the **`📁 Auto-Detect Project`** button to auto-fill the path of your active file tab or workspace root.

- **🎯 Clean Ticket ID Formatting**:
  - Automatically parses Jira/GitHub branch names into clean ticket IDs (e.g. `feature/IR-4102-fix-login` ➔ **`IR-4102`**).

- **📋 Same-Window UI with 1-Click Clipboard Copy**:
  - Outputs results directly inside the setup interface without opening separate markdown tabs. Includes clean `📋 Copy Content` and `🔄 Reset` buttons.

---

## 📥 Installation Instructions

### Method 1: Install via Antigravity / VS Code GUI (Recommended)

1. Download the file **`ai-timesheet-editor-1.0.0.vsix`**.
2. Open **Antigravity IDE** or **VS Code**.
3. Open the **Extensions** panel:
   - Linux / Windows: `Ctrl + Shift + X`
   - macOS: `Cmd + Shift + X`
4. Click the **`...` (Three Dots Menu)** at the top right of the Extensions panel.
5. Select **`Install from VSIX...`**.
6. Choose `ai-timesheet-editor-1.0.0.vsix` and click **Install**.
7. Reload your editor (`Ctrl + Shift + P` ➔ **`Developer: Reload Window`**).

---

### Method 2: Install via Command Line (CLI)

#### For Antigravity IDE:
```bash
antigravity --install-extension ai-timesheet-editor-1.0.0.vsix
```

#### For VS Code:
```bash
code --install-extension ai-timesheet-editor-1.0.0.vsix
```

---

## 📖 Step-by-Step Usage Guide

### 1. Launching the Extension
- Click **`✨ AI Timesheet Editor`** on the status bar (bottom right of the window).
- *Or* press `Ctrl + Shift + P` (or `Cmd + Shift + P` on macOS) and type **`AI Timesheet Editor: Generate Worklog`**.

---

### 2. Mode 1: AI Mode (Direct Integration)
1. Check **`Enable AI Mode`**.
2. Paste your Google Gemini API Key. *(Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey))*.
3. Click **`📁 Auto-Detect Project`** or enter the target Git project directory path.
4. Set your **Target Hours** (e.g., `8.0`).
5. Select your **Timeframe Window** (e.g., `Today` or `Last 8 Hours`).
6. Click **`🚀 Generate AI Timesheet`**.
7. View your generated worklog right in the window and click **`📋 Copy Content`**!

---

### 3. Mode 2: Non-AI Mode (1-Click Prompt Copy)
1. Uncheck **`Enable AI Mode`**.
2. Click **`📁 Auto-Detect Project`** or enter the target Git repository path.
3. Select your desired **Work Hours** and **Timeframe Window**.
4. Click **`📋 Generate AI Prompt`**.
5. Click **`📋 Copy Prompt`**.
6. Paste the prompt directly into [ChatGPT](https://chatgpt.com), [Claude](https://claude.ai), or [Gemini Web](https://gemini.google.com) to get your formatted worklog!

---

## 📊 Sample Output Format

```markdown
### 📝 Daily Worklog Summary

**Ticket / Branch:** `IR-4102`
**Time Period:** Last 8 Hours
**Target Hours:** 8.0 hrs

#### ⏱️ Task Breakdown
1. **[IR-4102] Refactored authentication middleware & diff payload limit**
   - **Details:** Optimized git log parsing to prevent 503 high demand errors on LLM API endpoints.
   - **Time Allocated:** 5.0 hrs
   - **Status:** [Done]

2. **[IR-4102] Configurable hours & timeframe dropdown controls**
   - **Details:** Added front-end dropdowns for 8h/12h/24h filtering and auto-project path detection.
   - **Time Allocated:** 3.0 hrs
   - **Status:** [Currently Working On]

---
**Total Logged Hours:** 8.0 / 8.0 hrs
```

---

## 🛠️ Building & Packaging from Source

If you want to modify the source code or package the extension yourself:

### Prerequisites
- Node.js `v18+`
- `npm`

### Steps
1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Compile TypeScript**:
   ```bash
   npm run compile
   ```

3. **Build `.vsix` Installer**:
   ```bash
   npm run package
   # or
   npm run build
   ```
   *This compiles TypeScript and generates `ai-timesheet-editor-1.0.0.vsix` directly in the project workspace folder.*

---

## 🤝 Sharing with Teammates

To share this extension with your team:
1. Share the **`ai-timesheet-editor-1.0.0.vsix`** file (via Slack, Email, or shared drive).
2. Direct them to follow **Installation Method 1** above.

---

## 📄 License

MIT License. Designed & developed for seamless workflow productivity in Antigravity IDE and VS Code.
