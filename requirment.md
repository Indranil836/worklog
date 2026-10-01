# Product Requirements Document (PRD): Working Status Update AI Timesheet Automator

## 1. Executive Summary

* **Project Name:** Working Status Update AI Timesheet Automator (VS Code Extension & Standalone UI Application)

* **Target Audience:** Software developers, engineers, and contractors who are required to submit detailed, professional daily timesheets.

* **Core Value Proposition:** Automates the tedious, manual task of daily time logging. It extracts raw Git code changes (both committed and staged) across multiple branches and translates them into a perfectly balanced 8-hour timesheet with professional task descriptions.

## 2. AI Role & Core Capabilities

* **Persona / Identity:** A professional technical project manager who excels at translating raw code into business-value descriptions and accurately estimating effort.

* **Primary Tasks:**

  1. Parse a large text payload of raw Git code diffs (`+` additions and `-` deletions) generated over a single workday.

  2. Perform a deep semantic analysis of the code changes to understand the actual logic, bug fixes, or features implemented, rather than just relying on commit message titles.

  3. Evaluate the relative complexity, size, and significance of the changes per branch/ticket to proportionally distribute a fixed time constraint (exactly 8 hours).

  4. Translate the analyzed code logic into 3 to 4 professional, contextually rich, and grammatically correct English bullet points per ticket.

## 3. Data Inputs & Context Window

* **User Inputs:** An automated text payload containing the user's Git commit diffs (`git diff --patch`) and staged changes (`git diff --cached`) from the current day. The data is pre-grouped by branch/ticket name.

* **Reference Data (RAG / Knowledge Base):** General software engineering terminology, common Git workflows, and professional business writing standards.

* **Context Management:** Single-turn processing. Must be capable of parsing up to 10,000 lines of code diffs in a single prompt window.

## 4. Guardrails & Constraints (Crucial for AI)

* **Strict "Never Do" Rules (Negative Constraints):**

  * Never invent, hallucinate, or assume tasks that are not supported by the provided raw code diffs.

  * Never exceed or fall short of the total 8-hour time constraint (the sum of all ticket hours must equal exactly 8).

  * Never include raw code snippets, file paths, or highly technical jargon in the final output. Focus on *what* was accomplished, not *how* it was coded.

* **Strict "Always Do" Rules:**

  * Always group the final output clearly by Ticket Number (derived from the branch name).

  * Always use active-voice, professional verbs to start each bullet point (e.g., "Refactored", "Implemented", "Resolved").

* **Fallback Behavior:** If the provided prompt contains no code diffs (empty payload), explicitly state: "No code changes detected for today. Please manually summarize your administrative or investigative tasks to log your 8 hours."

## 5. Output Specifications

* **Formatting Rules:** Use clean Markdown format. Bold the Ticket Number and the Time Allocated.

* **Tone & Style:** Professional, concise, action-oriented, and easy for non-technical management to understand.

* **Multiple Branch Handling & Cumulative Time:** The output *must* dynamically generate a distinct block for *each* branch/ticket detected in the daily diffs. It must calculate the fractional hours spent per ticket so that the cumulative total across all tickets equals exactly 8.0 hours.

* **Length & Structure:** Output must strictly follow this visual format, repeating the ticket block for each branch worked on, and ending with a final cumulative total confirming the 8 hours:

  **Ticket Number:** 

  $$
  Branch Name A
  $$

  
  **Time Logged:** 

  $$
  Calculated Hours for A, e.g., 5.5 hours
  $$

  
  **Work Details:**

  * $$
    Bullet point 1
    $$

  * $$
    Bullet point 2
    $$

  * $$
    Bullet point 3
    $$

  **Ticket Number:** 

  $$
  Branch Name B
  $$

  
  **Time Logged:** 

  $$
  Calculated Hours for B, e.g., 2.5 hours
  $$

  
  **Work Details:**

  * $$
    Bullet point 1
    $$

  * $$
    Bullet point 2
    $$

  * $$
    Bullet point 3
    $$

  **Total Cumulative Time Logged:** 8.0 Hours

## 6. Technical & Integration Requirements

* **LLM Model Preference:** Models strong in coding and logic (e.g., Gemini 1.5 Pro, GPT-4o, Claude 3.5 Sonnet).

* **API / System Integrations:**

  * Requires a local UI Application or VS Code Extension to execute local `git` commands (`git log`, `git diff`, `git branch`). This application must successfully extract the raw code diffs and pass them to the AI, ensuring the AI has the exact code logic needed to perform its deep analysis for better log generation.

  * Needs local filesystem access to read the `.git` directory.

* **Performance Metrics:** The LLM must process the code diffs and return the formatted timesheet in under 10 seconds to ensure a seamless end-of-day developer experience.