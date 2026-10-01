import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as path from 'path';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  // Create Status Bar Item for easy access directly from the Antigravity editor bar
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'ai-timesheet-editor.open';
  statusBarItem.text = '$(sparkle) AI Timesheet Editor';
  statusBarItem.tooltip = 'Click to open AI Timesheet Editor';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  let disposable = vscode.commands.registerCommand('ai-timesheet-editor.open', () => {
    const panel = vscode.window.createWebviewPanel(
      'aiTimesheetEditor',
      'AI Timesheet Editor',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const initialFolder = getActiveFolderPath();
    
    // Load saved configurations from global state
    const savedApiKey = context.globalState.get<string>('geminiApiKey') || '';
    const savedTargetHours = context.globalState.get<string>('targetHours') || '8.0';
    const savedTimeframe = context.globalState.get<string>('timeframeWindow') || 'today';
    const savedMode = context.globalState.get<string>('mode') || 'ai';

    panel.webview.html = getWebviewContent(initialFolder, savedApiKey, savedTargetHours, savedTimeframe, savedMode);

    panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'detectFolder': {
            const detectedPath = getActiveFolderPath();
            panel.webview.postMessage({ command: 'folderDetected', path: detectedPath });
            return;
          }
          case 'generate':
            // Persist user preferences
            if (message.apiKey) await context.globalState.update('geminiApiKey', message.apiKey);
            await context.globalState.update('targetHours', message.targetHours);
            await context.globalState.update('timeframeWindow', message.timeframeWindow);
            await context.globalState.update('mode', message.mode);
            
            await handleGenerate(
              panel, 
              message.apiKey, 
              message.folderPath, 
              message.mode, 
              message.targetHours,
              message.timeframeWindow
            );
            return;
        }
      },
      undefined,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);
}

function getActiveFolderPath(): string {
  if (vscode.window.activeTextEditor) {
    const docUri = vscode.window.activeTextEditor.document.uri;
    const wsFolder = vscode.workspace.getWorkspaceFolder(docUri);
    if (wsFolder) return wsFolder.uri.fsPath;
    if (docUri.scheme === 'file') return path.dirname(docUri.fsPath);
  }
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  return '';
}

function getTimeframeGitOption(timeframe: string): { gitSince: string; label: string } {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });

  switch (timeframe) {
    case '8h': {
      const past = new Date(now.getTime() - 8 * 60 * 60 * 1000);
      const pastTime = past.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return { gitSince: '8 hours ago', label: `Last 8 Hours (${pastTime} to ${timeStr})` };
    }
    case '12h': {
      const past = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const pastTime = past.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return { gitSince: '12 hours ago', label: `Last 12 Hours (${pastTime} to ${timeStr})` };
    }
    case '24h': {
      return { gitSince: '24 hours ago', label: `Last 24 Hours (Up to ${timeStr})` };
    }
    case '48h': {
      return { gitSince: '48 hours ago', label: `Last 48 Hours (Up to ${timeStr})` };
    }
    case '7d': {
      return { gitSince: '7 days ago', label: `Last 7 Days (${dateStr})` };
    }
    case 'today':
    default: {
      return { gitSince: 'midnight', label: `Today (Midnight 00:00 to ${timeStr})` };
    }
  }
}

async function handleGenerate(
  panel: vscode.WebviewPanel, 
  apiKey: string, 
  folderPath: string, 
  mode: string, 
  targetHours: string,
  timeframeWindow: string
) {
  try {
    const hoursNum = parseFloat(targetHours) || 8.0;
    const hoursFormatted = hoursNum.toFixed(1);

    if (mode === 'ai' && !apiKey) {
      throw new Error("Gemini API Key is required for AI Mode. Please enter your API Key or switch to Non-AI Mode.");
    }
    if (!folderPath) {
      throw new Error("Project folder path is required.");
    }

    panel.webview.postMessage({ command: 'progress', text: 'Checking Git repository...' });

    const runGit = async (cmd: string) => {
      try {
        const { stdout } = await execAsync(`git ${cmd}`, { cwd: folderPath, maxBuffer: 10 * 1024 * 1024 });
        return stdout.trim();
      } catch (e) {
        return "";
      }
    };

    // Check if the directory is a git repository
    const isGitRepo = await runGit("rev-parse --is-inside-work-tree");
    if (!isGitRepo) {
      throw new Error(`The folder "${folderPath}" is not a Git repository. Please enter a valid Git project path.`);
    }

    panel.webview.postMessage({ command: 'progress', text: 'Extracting Git diffs & branch activity...' });

    const currentBranch = await runGit("branch --show-current") || "main";
    const allBranchesRaw = await runGit("branch --sort=-committerdate --format='%(refname:short)'");
    const branchList = allBranchesRaw ? allBranchesRaw.split('\n').map(b => b.trim()).filter(Boolean) : [currentBranch];
    
    // Filter out lockfiles and build outputs
    const excludeSpecs = "':!package-lock.json' ':!yarn.lock' ':!pnpm-lock.yaml' ':!*.map' ':!dist/*' ':!out/*' ':!node_modules/*'";

    // Determine timeframe & date based on dropdown selection
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
    const tfConfig = getTimeframeGitOption(timeframeWindow);
    let timeframeLabel = tfConfig.label;

    // Extract committed changes across ALL branches (Done) using selected timeframe
    let gitLog = await runGit(`log --since="${tfConfig.gitSince}" --all --format="COMMIT||%H||%d||%an||%cd||%s" --stat -p -- . ${excludeSpecs}`);
    if (!gitLog && timeframeWindow === 'today') {
      // Fallback if today has no commits
      gitLog = await runGit(`log --since="24 hours ago" --all --format="COMMIT||%H||%d||%an||%cd||%s" --stat -p -- . ${excludeSpecs}`);
      timeframeLabel = `Last 24 Hours (Fallback)`;
    }
    if (!gitLog) {
      gitLog = await runGit(`log -n 5 --all --format="COMMIT||%H||%d||%an||%cd||%s" --stat -p -- . ${excludeSpecs}`);
      timeframeLabel += ` (Fallback to Recent Commits)`;
    }

    // Extract in-progress changes (Staged & Unstaged on active branch)
    const stagedDiff = await runGit(`diff --cached --stat -p -- . ${excludeSpecs}`);
    const unstagedDiff = await runGit(`diff --stat -p -- . ${excludeSpecs}`);

    // Detect all ticket numbers or branch names active in this timeframe
    const detectedTickets = new Set<string>();
    const currentMatch = currentBranch.match(/([A-Z]+-\d+)/i);
    if (currentMatch) {
      detectedTickets.add(currentMatch[0].toUpperCase());
    } else if (currentBranch !== 'main' && currentBranch !== 'master') {
      detectedTickets.add(currentBranch);
    }

    if (gitLog) {
      const ticketMatches = gitLog.match(/([A-Z]+-\d+)/gi);
      if (ticketMatches) {
        ticketMatches.forEach(t => detectedTickets.add(t.toUpperCase()));
      }
    }

    branchList.forEach(b => {
      const m = b.match(/([A-Z]+-\d+)/i);
      if (m) detectedTickets.add(m[0].toUpperCase());
    });

    const ticketsSummary = Array.from(detectedTickets).length > 0 
      ? Array.from(detectedTickets).join(', ') 
      : (currentBranch.split('/').pop() || currentBranch);

    let gitData = `TIMEFRAME CONSIDERED: ${timeframeLabel}\nDATE: ${dateStr}\n`;
    gitData += `CURRENT ACTIVE BRANCH (UNCOMMITTED CHANGES): ${currentBranch}\n`;
    gitData += `DETECTED WORKED TICKETS / BRANCHES IN TIMEFRAME: ${ticketsSummary}\n`;
    gitData += `ALL REPOSITORY BRANCHES: ${branchList.join(', ')}\n\n`;

    if (gitLog) {
      gitData += `=== COMPLETED TASKS ACROSS ALL BRANCHES (STATUS: DONE - COMMITTED CHANGES) ===\n${gitLog}\n\n`;
    }

    if (stagedDiff || unstagedDiff) {
      gitData += `=== IN-PROGRESS TASKS ON ACTIVE BRANCH (${currentBranch}) (STATUS: CURRENTLY WORKING ON - UNCOMMITTED CHANGES) ===\n`;
      if (stagedDiff) gitData += `--- Staged Changes (Ready to commit) ---\n${stagedDiff}\n`;
      if (unstagedDiff) gitData += `--- Unstaged Working Directory Changes ---\n${unstagedDiff}\n`;
    }

    if (!gitLog && !stagedDiff && !unstagedDiff) {
      throw new Error(`No commits or changes found in Git repository at "${folderPath}" for selected timeframe (${timeframeLabel}).`);
    }

    // Limit payload length safely to 6,000 characters so multi-branch diff details are included without overloading
    if (gitData.length > 6000) {
      gitData = gitData.substring(0, 6000) + "\n\n...[Diff details truncated for fast AI processing]...";
    }

    const prompt = `
Analyze the following Git commits across ALL branches, branch activity, and code diffs for the specified timeframe.
Generate a professional ${hoursFormatted}-hour daily timesheet worklog.

METADATA & TIMEFRAME CONSIDERED:
- Date: ${dateStr}
- Timeframe Considered: ${timeframeLabel}
- Current Active Branch (Uncommitted changes): ${currentBranch}
- Detected Worked Tickets / Branches: ${ticketsSummary}

CRITICAL MANDATORY RULES:
1. **Multi-Branch & Multi-Ticket Support**:
   - Inspect ALL commits in the Git log across all branches worked on within this timeframe.
   - Create a separate worklog section for EACH ticket number (e.g. IR-4102, PROJ-101) or branch worked on during this timeframe.
   - For committed changes on a branch, classify **Task Status:** Done.
   - For staged/unstaged changes on the current active branch, classify **Task Status:** Currently Working On.
2. **Time Allocation**:
   - Divide and allocate hours across all tickets/branches worked on during this timeframe.
   - Total cumulative hours across ALL tickets MUST equal EXACTLY ${hoursFormatted} Hours.
3. **Work Details**:
   - Provide 3-4 professional, concise English bullet points per ticket detailing business value and specific code logic implemented. No raw code blocks.

Format:
**Date:** ${dateStr}
**Timeframe Considered:** ${timeframeLabel}

[Repeat the block below for EACH ticket / branch worked on during this timeframe]:
---
**Ticket Number:** 
[Ticket ID or Branch Name, e.g. IR-4102]

**Task Status:** 
[Done / Currently Working On]

**Time Logged:** 
[Calculated Hours for this ticket, e.g. 4.5] hours

**Work Details:**
* [Bullet 1 describing work done for this ticket]
* [Bullet 2 detailing business value / logic]
* [Bullet 3 detailing code changes]

---

**Total Cumulative Time Logged:** ${hoursFormatted} Hours

Git Activity & Code Diffs Across All Branches:
\`\`\`
${gitData}
\`\`\`
`;

    if (mode === 'non-ai') {
      // Non-AI Mode: Send formatted instruction prompt directly for copying!
      panel.webview.postMessage({ 
        command: 'result', 
        text: prompt.trim(), 
        mode: 'non-ai',
        notice: `📝 Non-AI Mode Active (${timeframeLabel}): Copy the prompt below and paste it into ChatGPT, Claude, or Gemini online.`
      });
      return;
    }

    // AI Mode: Call Gemini API
    panel.webview.postMessage({ command: 'progress', text: 'Generating AI Timesheet with Gemini...' });

    const resultText = await callGeminiWithFallback(apiKey, prompt, (statusText) => {
      panel.webview.postMessage({ command: 'progress', text: statusText });
    });

    panel.webview.postMessage({ 
      command: 'result', 
      text: resultText,
      mode: 'ai',
      notice: `✨ AI Mode Active (${timeframeLabel}): Worklog generated successfully!`
    });

  } catch (err: any) {
    panel.webview.postMessage({ command: 'error', text: err.message });
  }
}

async function callGeminiWithFallback(apiKey: string, prompt: string, onProgress: (msg: string) => void): Promise<string> {
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro'
  ];

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 900,
      temperature: 0.2
    }
  });

  let errors: string[] = [];

  for (const model of models) {
    try {
      onProgress(`Generating worklog using ${model}...`);
      const response = await makeApiCall(model, apiKey, payload);
      return response;
    } catch (err: any) {
      const errMsg = err.message || String(err);
      errors.push(`${model}: ${errMsg}`);
      continue;
    }
  }

  throw new Error(`Gemini API Error: All models failed. ${errors.join(' | ')}`);
}

function makeApiCall(model: string, apiKey: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errText = data;
          try {
            const errJson = JSON.parse(data);
            if (errJson.error && errJson.error.message) {
              errText = errJson.error.message;
            }
          } catch(e) {}
          return reject(new Error(`(${res.statusCode}) ${errText}`));
        }
        try {
          const parsed = JSON.parse(data);
          if (!parsed.candidates || !parsed.candidates[0] || !parsed.candidates[0].content) {
            return reject(new Error(`Empty response structure from ${model}`));
          }
          const text = parsed.candidates[0].content.parts[0].text;
          resolve(text);
        } catch (e: any) {
          reject(new Error(`Failed to parse API response from ${model}: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Network error connecting to ${model}: ${e.message}`));
    });

    req.write(payload);
    req.end();
  });
}

function getWebviewContent(initialFolder: string, savedApiKey: string, savedTargetHours: string, savedTimeframe: string, savedMode: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Timesheet Editor</title>
    <style>
      :root {
        --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      body {
        font-family: var(--vscode-font-family);
        padding: 25px 20px;
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
        max-width: 650px;
        margin: 0 auto;
      }
      .header {
        text-align: center;
        margin-bottom: 22px;
      }
      .header h2 {
        margin: 0 0 6px 0;
        font-size: 20px;
      }
      .header p {
        color: var(--vscode-descriptionForeground);
        margin: 0;
        font-size: 13px;
      }
      .mode-switch {
        display: flex;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        padding: 4px;
        margin-bottom: 22px;
        gap: 4px;
      }
      .mode-tab {
        flex: 1;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: var(--vscode-foreground);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        border-radius: 4px;
        transition: all 0.2s ease;
        margin-top: 0 !important;
        text-align: center;
      }
      .mode-tab.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-weight: 600;
      }
      .input-group {
        margin-bottom: 18px;
      }
      .input-row {
        display: flex;
        gap: 12px;
      }
      .flex-2 { flex: 2; }
      .flex-1 { flex: 1; }
      label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 600;
        font-size: 13px;
      }
      .badge {
        font-size: 11px;
        font-weight: normal;
        color: var(--vscode-descriptionForeground);
        background: var(--vscode-badge-background, rgba(255,255,255,0.1));
        padding: 2px 6px;
        border-radius: 3px;
      }
      .btn-link {
        background: none;
        border: none;
        color: var(--vscode-textLink-foreground);
        cursor: pointer;
        padding: 0;
        font-size: 12px;
        font-weight: normal;
        margin-top: 0 !important;
        width: auto !important;
        text-decoration: underline;
      }
      .btn-link:hover {
        color: var(--vscode-textLink-activeForeground);
        background: none !important;
      }
      input, select {
        width: 100%;
        padding: 10px;
        box-sizing: border-box;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 5px;
        font-size: 13px;
      }
      input:focus, select:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
      }
      button {
        padding: 12px 20px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-weight: 600;
        width: 100%;
        font-size: 14px;
        margin-top: 10px;
        transition: opacity 0.2s;
      }
      button:hover {
        background: var(--vscode-button-hoverBackground);
      }
      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      #status {
        margin-top: 18px;
        font-weight: 500;
        color: var(--vscode-textLink-foreground);
        text-align: center;
      }
      #error {
        margin-top: 18px;
        color: var(--vscode-errorForeground);
        font-weight: 500;
        padding: 12px;
        background: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        border-radius: 5px;
        display: none;
      }
      #resultCard {
        display: none;
        margin-top: 20px;
      }
      .result-notice {
        padding: 10px 12px;
        background: var(--vscode-textBlockQuote-background, rgba(0, 122, 204, 0.1));
        border-left: 4px solid var(--vscode-textLink-foreground);
        margin-bottom: 12px;
        font-size: 13px;
        border-radius: 3px;
        line-height: 1.4;
      }
      textarea#resultOutput {
        width: 100%;
        height: 360px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 5px;
        padding: 12px;
        font-family: monospace;
        font-size: 13px;
        box-sizing: border-box;
        resize: vertical;
        line-height: 1.5;
      }
      .action-row {
        display: flex;
        gap: 10px;
        margin-top: 12px;
      }
      .btn-secondary {
        background: var(--vscode-button-secondaryBackground, #3a3d41);
        color: var(--vscode-button-secondaryForeground, #ffffff);
      }
      .btn-secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground, #45494e);
      }
    </style>
</head>
<body>
    <div class="header">
      <h2>✨ AI Timesheet Editor</h2>
      <p>Configure project path, work hours, timeframe, and generation mode.</p>
    </div>

    <!-- Mode Selector Tabs -->
    <div class="mode-switch">
      <button type="button" class="mode-tab ${savedMode === 'ai' ? 'active' : ''}" id="tabAi">🤖 AI Mode (Direct API)</button>
      <button type="button" class="mode-tab ${savedMode === 'non-ai' ? 'active' : ''}" id="tabNonAi">📝 Non-AI Mode (Prompt Copy)</button>
    </div>

    <div id="setupForm">
      <div class="input-group" id="apiKeyGroup" style="${savedMode === 'non-ai' ? 'display:none;' : ''}">
          <label>Gemini API Key <span class="badge">Required for AI Mode</span></label>
          <input type="password" id="apiKey" value="${savedApiKey}" placeholder="Enter Gemini API Key (e.g. AIzaSy...)">
      </div>
      
      <div class="input-group">
          <label>
            Project Folder Path
            <button type="button" class="btn-link" id="detectFolderBtn">📁 Auto-Detect Project</button>
          </label>
          <input type="text" id="folderPath" value="${initialFolder}" placeholder="/path/to/your/git/project">
      </div>

      <div class="input-row">
        <div class="input-group flex-1">
            <label>Work Hours</label>
            <input type="number" id="targetHours" value="${savedTargetHours}" step="0.5" min="1" max="24" placeholder="8.0">
        </div>

        <div class="input-group flex-1">
            <label>Timeframe Window</label>
            <select id="timeframeWindow">
                <option value="today" ${savedTimeframe === 'today' ? 'selected' : ''}>Today (Midnight)</option>
                <option value="8h" ${savedTimeframe === '8h' ? 'selected' : ''}>Last 8 Hours</option>
                <option value="12h" ${savedTimeframe === '12h' ? 'selected' : ''}>Last 12 Hours</option>
                <option value="24h" ${savedTimeframe === '24h' ? 'selected' : ''}>Last 24 Hours</option>
                <option value="48h" ${savedTimeframe === '48h' ? 'selected' : ''}>Last 48 Hours</option>
                <option value="7d" ${savedTimeframe === '7d' ? 'selected' : ''}>Last 7 Days</option>
            </select>
        </div>
      </div>

      <button id="generateBtn">${savedMode === 'non-ai' ? '📋 Generate AI Prompt for External AI' : '🚀 Generate AI Timesheet'}</button>
    </div>

    <div id="status"></div>
    <div id="error"></div>

    <div id="resultCard">
      <div class="result-notice" id="resultNotice"></div>
      <textarea id="resultOutput"></textarea>
      <div class="action-row">
        <button id="copyBtn">📋 Copy Content</button>
        <button id="backBtn" class="btn-secondary">⚙️ Edit Settings</button>
      </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentMode = '${savedMode}';

        const tabAi = document.getElementById('tabAi');
        const tabNonAi = document.getElementById('tabNonAi');
        const apiKeyGroup = document.getElementById('apiKeyGroup');
        const generateBtn = document.getElementById('generateBtn');
        const detectFolderBtn = document.getElementById('detectFolderBtn');
        const folderPathInput = document.getElementById('folderPath');
        const timeframeSelect = document.getElementById('timeframeWindow');

        const statusDiv = document.getElementById('status');
        const errorDiv = document.getElementById('error');
        const setupForm = document.getElementById('setupForm');
        const resultCard = document.getElementById('resultCard');
        const resultNotice = document.getElementById('resultNotice');
        const resultOutput = document.getElementById('resultOutput');
        const copyBtn = document.getElementById('copyBtn');
        const backBtn = document.getElementById('backBtn');

        function setMode(mode) {
          currentMode = mode;
          if (mode === 'ai') {
            tabAi.classList.add('active');
            tabNonAi.classList.remove('active');
            apiKeyGroup.style.display = 'block';
            generateBtn.textContent = '🚀 Generate AI Timesheet';
          } else {
            tabNonAi.classList.add('active');
            tabAi.classList.remove('active');
            apiKeyGroup.style.display = 'none';
            generateBtn.textContent = '📋 Generate AI Prompt for External AI';
          }
        }

        tabAi.addEventListener('click', () => setMode('ai'));
        tabNonAi.addEventListener('click', () => setMode('non-ai'));

        detectFolderBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'detectFolder' });
        });

        generateBtn.addEventListener('click', () => {
            const apiKey = document.getElementById('apiKey').value.trim();
            const folderPath = folderPathInput.value.trim();
            const targetHours = document.getElementById('targetHours').value.trim() || '8.0';
            const timeframeWindow = timeframeSelect.value;

            if (currentMode === 'ai' && !apiKey) {
              errorDiv.style.display = 'block';
              errorDiv.textContent = 'Please enter your Gemini API Key or switch to Non-AI Mode.';
              return;
            }
            
            if (!folderPath) {
              errorDiv.style.display = 'block';
              errorDiv.textContent = 'Please enter a project folder path.';
              return;
            }

            statusDiv.textContent = 'Starting workflow...';
            errorDiv.style.display = 'none';
            resultCard.style.display = 'none';
            generateBtn.disabled = true;

            vscode.postMessage({
                command: 'generate',
                apiKey,
                folderPath,
                mode: currentMode,
                targetHours,
                timeframeWindow
            });
        });

        copyBtn.addEventListener('click', () => {
            resultOutput.select();
            document.execCommand('copy');
            copyBtn.textContent = '✅ Copied to Clipboard!';
            setTimeout(() => {
                copyBtn.textContent = '📋 Copy Content';
            }, 2000);
        });

        backBtn.addEventListener('click', () => {
            setupForm.style.display = 'block';
            resultCard.style.display = 'none';
            statusDiv.textContent = '';
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'folderDetected':
                    if (message.path) {
                      folderPathInput.value = message.path;
                      statusDiv.textContent = '📁 Auto-detected active project path!';
                      setTimeout(() => { statusDiv.textContent = ''; }, 2500);
                    }
                    break;
                case 'progress':
                    statusDiv.textContent = message.text;
                    errorDiv.style.display = 'none';
                    if (message.text.includes('successfully')) {
                      generateBtn.disabled = false;
                    }
                    break;
                case 'result':
                    statusDiv.textContent = '✨ Task completed successfully!';
                    errorDiv.style.display = 'none';
                    generateBtn.disabled = false;
                    setupForm.style.display = 'none';
                    resultCard.style.display = 'block';
                    resultNotice.textContent = message.notice || '';
                    resultOutput.value = message.text;
                    break;
                case 'error':
                    statusDiv.textContent = '';
                    errorDiv.style.display = 'block';
                    errorDiv.textContent = message.text;
                    generateBtn.disabled = false;
                    break;
            }
        });
    </script>
</body>
</html>`;
}

export function deactivate() {}
