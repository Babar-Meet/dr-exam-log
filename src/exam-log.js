import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { activeWindow } from "active-win";

const BROWSER_PROCESSES = new Set([
  "chrome",
  "msedge",
  "firefox",
  "brave",
  "opera",
  "safari",
  "chromium",
]);

const BROWSER_TITLE_SUFFIXES = [
  " - google chrome",
  " - chrome",
  " - microsoft edge",
  " - edge",
  " - brave browser",
  " - brave",
  " - mozilla firefox",
  " - firefox",
  " - opera",
  " - chromium",
  " - safari",
];

const BROWSER_TITLE_PROCESS_HINTS = [
  { suffix: " - google chrome", processName: "chrome" },
  { suffix: " - chrome", processName: "chrome" },
  { suffix: " - microsoft edge", processName: "msedge" },
  { suffix: " - edge", processName: "msedge" },
  { suffix: " - mozilla firefox", processName: "firefox" },
  { suffix: " - firefox", processName: "firefox" },
  { suffix: " - brave browser", processName: "brave" },
  { suffix: " - brave", processName: "brave" },
  { suffix: " - opera", processName: "opera" },
  { suffix: " - chromium", processName: "chromium" },
  { suffix: " - safari", processName: "safari" },
];

const KNOWN_TITLE_URL_HINTS = [
  { pattern: /chatgpt/i, url: "https://chatgpt.com" },
  { pattern: /youtube/i, url: "https://www.youtube.com" },
  { pattern: /gmail/i, url: "https://mail.google.com" },
  { pattern: /google/i, url: "https://www.google.com" },
  { pattern: /darshan|gnums/i, url: "https://darshanums.in/Login.aspx" },
  { pattern: /deepseek/i, url: "https://deepseek.com" },
];

const PROCESS_LABELS = {
  explorer: "File Explorer",
  powershell: "PowerShell",
  pwsh: "PowerShell",
  cmd: "Command Prompt",
  code: "VS Code",
  adobepremierepro: "Adobe Premiere Pro",
  premierepro: "Adobe Premiere Pro",
  "adobe premiere pro": "Adobe Premiere Pro",
  chrome: "Chrome",
  msedge: "Edge",
  firefox: "Firefox",
  brave: "Brave",
  opera: "Opera",
  safari: "Safari",
  chromium: "Chromium",
};

function normalizeProcessName(owner) {
  const raw = typeof owner === "string" ? owner : owner?.name;
  const name = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!name) {
    return "";
  }

  const normalized = name.endsWith(".exe") ? name.slice(0, -4) : name;

  if (normalized.includes("chrome")) {
    return "chrome";
  }
  if (normalized.includes("edge")) {
    return "msedge";
  }
  if (normalized.includes("firefox")) {
    return "firefox";
  }
  if (normalized.includes("brave")) {
    return "brave";
  }
  if (normalized.includes("opera")) {
    return "opera";
  }
  if (normalized.includes("safari")) {
    return "safari";
  }
  if (normalized.includes("chromium")) {
    return "chromium";
  }
  if (normalized.includes("code")) {
    return "code";
  }
  if (normalized.includes("premiere")) {
    return "adobepremierepro";
  }

  return normalized;
}

function inferProcessFromWindowTitle(windowTitle) {
  const title = String(windowTitle ?? "")
    .trim()
    .toLowerCase();
  if (!title) {
    return "";
  }

  for (const hint of BROWSER_TITLE_PROCESS_HINTS) {
    if (title.includes(hint.suffix)) {
      return hint.processName;
    }
  }

  return "";
}

function correctProcessByWindowTitle(processName, windowTitle) {
  const current = normalizeProcessName(processName);
  const fromTitle = inferProcessFromWindowTitle(windowTitle);
  if (fromTitle) {
    return fromTitle;
  }
  return current;
}

function friendlyProcessName(processName) {
  if (!processName) {
    return "Unknown";
  }

  return PROCESS_LABELS[processName] ?? processName;
}

function canonicalKey(kind, value) {
  return `${kind}:${String(value).trim().toLowerCase()}`;
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  const candidate = String(url ?? "").trim();
  if (/^(https?:\/\/|file:\/\/)/i.test(candidate)) {
    return candidate;
  }
  return "";
}

function inferUrlFromTitle(windowTitle) {
  const title = String(windowTitle ?? "").trim();
  if (!title) {
    return "";
  }

  for (const hint of KNOWN_TITLE_URL_HINTS) {
    if (hint.pattern.test(title)) {
      return hint.url;
    }
  }

  return "";
}

function inferBrowserTabName(windowTitle, activeUrl) {
  const title = String(windowTitle ?? "").trim();
  if (title) {
    const titleLower = title.toLowerCase();
    for (const suffix of BROWSER_TITLE_SUFFIXES) {
      if (titleLower.endsWith(suffix)) {
        const candidate = title.slice(0, title.length - suffix.length).trim();
        if (candidate) {
          return candidate;
        }
      }
    }
    return title;
  }

  const normalizedUrl = normalizeUrl(activeUrl);
  if (!normalizedUrl) {
    return "Browser Tab";
  }

  const parsed = parseUrl(normalizedUrl);
  if (!parsed) {
    return normalizedUrl;
  }

  if (parsed.protocol === "file:") {
    const decodedPath = decodeURIComponent(parsed.pathname ?? "").replace(
      /\\/g,
      "/",
    );
    const filename = decodedPath.split("/").filter(Boolean).pop();
    if (filename) {
      return filename;
    }
  }

  const host = String(parsed.hostname ?? "").trim();
  const pathname = String(parsed.pathname ?? "").trim();
  if (host && pathname && pathname !== "/") {
    return `${host}${pathname}`;
  }
  if (host) {
    return host;
  }

  return normalizedUrl;
}

function runPowerShell(script, timeoutMs = 1400) {
  const shells = ["powershell", "pwsh"];

  for (const shell of shells) {
    const result = spawnSync(shell, ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      timeout: timeoutMs,
      windowsHide: true,
    });

    if (!result.error) {
      return String(result.stdout ?? "");
    }
  }

  return "";
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const line = lines[idx];
    if (!line.startsWith("{") || !line.endsWith("}")) {
      continue;
    }

    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning; PowerShell can print extra lines around JSON output.
    }
  }

  return null;
}

function parseLastLine(stdout) {
  const lines = String(stdout ?? "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length ? lines[lines.length - 1] : "";
}

function collectChromeUrlFromDevTools() {
  if (process.platform !== "win32") {
    return "";
  }

  const script = `
$ports = @(9222, 9223, 9229)
foreach ($port in $ports) {
  try {
    $tabs = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/json/list" -f $port) -TimeoutSec 1 -ErrorAction Stop
    if ($tabs -is [System.Array]) {
      foreach ($tab in $tabs) {
        if ($null -eq $tab) { continue }
        $type = [string]$tab.type
        if ($type -and $type -ne "page") { continue }

        $url = [string]$tab.url
        if ($url -match '^(https?://|file://)') {
          $url.Trim()
          return
        }
      }
    }
  }
  catch {}
}
`;

  const stdout = runPowerShell(script, 2000);
  return normalizeUrl(parseLastLine(stdout));
}

function collectWindowsFocusContext() {
  if (process.platform !== "win32") {
    return null;
  }

  const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextLength(IntPtr hWnd);
}
"@

$processName = ""
$title = ""
$url = ""

$hwnd = [Win32]::GetForegroundWindow()
if ($hwnd -ne [IntPtr]::Zero) {
    $pid = 0
    [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
    if ($pid -gt 0) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            $processName = $proc.ProcessName.ToLowerInvariant()
        }
    }

    $titleLen = [Win32]::GetWindowTextLength($hwnd)
    if ($titleLen -gt 0) {
        $sb = New-Object System.Text.StringBuilder ($titleLen + 1)
        [Win32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
        $title = $sb.ToString().Trim()
    }

    $browserNames = @("chrome", "msedge", "brave", "opera", "chromium", "firefox")
    if ($browserNames -contains $processName) {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
        if ($null -ne $root) {
            $condition = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Edit
            )
            $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Subtree, $condition)

            for ($i = 0; $i -lt $edits.Count; $i++) {
                try {
                    $edit = $edits.Item($i)
                    $patternObj = $null
                $candidate = ""
                    if ($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$patternObj)) {
                        $value = $patternObj.Current.Value
                        if ($value -and $value -match '^(https?://|file://)') {
                            $url = $value.Trim()
                            break
                        }
                    }

                if (-not $candidate) {
                  $candidate = [string]$edit.Current.Name
                }

                if ($candidate -and $candidate -match '^(https?://|file://)') {
                  $url = $candidate.Trim()
                  break
                }
                }
                catch {}
            }
        }
    }
}

[pscustomobject]@{
    processName = $processName
    title = $title
    url = $url
} | ConvertTo-Json -Compress
`;

  const stdout = runPowerShell(script);
  const parsed = parseLastJsonLine(stdout);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const title = String(parsed.title ?? "").trim();
  const processName = correctProcessByWindowTitle(
    String(parsed.processName ?? ""),
    title,
  );

  return {
    processName,
    title,
    url: normalizeUrl(parsed.url),
  };
}

function resolveState(windowInfo, options = {}) {
  if (!windowInfo || typeof windowInfo !== "object") {
    return {
      kind: "unknown",
      value: "Unknown",
      key: canonicalKey("unknown", "Unknown"),
    };
  }

  const title = String(windowInfo.title ?? "").trim();
  const processName = correctProcessByWindowTitle(
    normalizeProcessName(windowInfo.owner),
    title,
  );
  const detectedUrl = normalizeUrl(options.detectedUrl || windowInfo.url);
  const browserForeground = BROWSER_PROCESSES.has(processName);
  const inferredUrl = browserForeground ? inferUrlFromTitle(title) : "";
  const url = detectedUrl || inferredUrl;

  if (browserForeground && url) {
    const tabName = inferBrowserTabName(title, url);
    const value = `${tabName}(${url})`;
    return {
      kind: "web",
      value,
      key: canonicalKey("web", `${processName}|${url}`),
    };
  }

  if (browserForeground) {
    const tabName = inferBrowserTabName(title, "");
    const value = tabName || `${friendlyProcessName(processName)} Tab`;
    return {
      kind: "browser",
      value,
      key: canonicalKey("browser", `${processName}|${value}`),
    };
  }

  if (processName) {
    const value = friendlyProcessName(processName);
    return {
      kind: "app",
      value,
      key: canonicalKey("app", value),
    };
  }

  if (title) {
    return {
      kind: "window",
      value: title,
      key: canonicalKey("window", title),
    };
  }

  return {
    kind: "unknown",
    value: "Unknown",
    key: canonicalKey("unknown", "Unknown"),
  };
}

function resolveDownloadsDir() {
  const home = os.homedir();
  const fromEnv = String(process.env.DR_EXAM_LOG_OUTPUT_DIR ?? "").trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  const candidates = [
    path.join(home, "Downloads"),
    path.join(String(process.env.USERPROFILE ?? home), "Downloads"),
    path.join(home, "downloads"),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function resolveDefaultLogPath() {
  return path.join(resolveDownloadsDir(), "proctor_state_transitions.log");
}

export class StateTransitionLogger {
  constructor(logPath) {
    this.logPath = path.resolve(logPath ?? resolveDefaultLogPath());
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });

    const shouldWriteHeader =
      !fs.existsSync(this.logPath) || fs.statSync(this.logPath).size === 0;
    if (shouldWriteHeader) {
      fs.appendFileSync(
        this.logPath,
        "timestamp | current_state ----> next_state\n",
        "utf8",
      );
    }

    this.lastKey = "";
    this.lastValue = "";
  }

  observe(state, atMs) {
    if (!state || !state.key) {
      return false;
    }

    if (!this.lastKey) {
      this.lastKey = state.key;
      this.lastValue = state.value;
      return false;
    }

    if (state.key === this.lastKey) {
      return false;
    }

    const stamp = new Date(atMs).toISOString().slice(0, 19);
    fs.appendFileSync(
      this.logPath,
      `${stamp} | ${this.lastValue} ----> ${state.value}\n`,
      "utf8",
    );

    this.lastKey = state.key;
    this.lastValue = state.value;
    return true;
  }

  close() {
    // no-op: writes are synchronous and flushed per transition.
  }
}

export async function runExamLog(options = {}) {
  const intervalSeconds = Math.max(0.2, Number(options.intervalSeconds ?? 1));
  const logger = new StateTransitionLogger(options.outputPath);

  let running = true;
  const stop = () => {
    if (!running) {
      return;
    }
    running = false;
    process.stdout.write("\n[INFO] Monitoring stopped.\n");
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  process.stdout.write(`[INFO] State transition log: ${logger.logPath}\n`);
  process.stdout.write("[INFO] Monitoring started. Press Ctrl+C to stop.\n");

  try {
    while (running) {
      const loopStartedAt = Date.now();
      let win = null;
      let detectedUrl = "";

      if (process.platform === "win32") {
        const winContext = collectWindowsFocusContext();
        let fallbackWin = null;
        try {
          fallbackWin = await activeWindow();
        } catch {
          fallbackWin = null;
        }

        const fallbackTitle = String(fallbackWin?.title ?? "").trim();
        const fallbackProcess = normalizeProcessName(fallbackWin?.owner);
        const mergedTitle =
          String(winContext?.title ?? "").trim() || fallbackTitle;
        const mergedProcess = correctProcessByWindowTitle(
          String(winContext?.processName ?? "").trim() || fallbackProcess,
          mergedTitle,
        );

        detectedUrl = normalizeUrl(winContext?.url || fallbackWin?.url);

        if (mergedProcess || mergedTitle || detectedUrl) {
          win = {
            title: mergedTitle,
            url: detectedUrl,
            owner: { name: mergedProcess || fallbackProcess },
          };
        }

        if (!detectedUrl && (mergedProcess || fallbackProcess) === "chrome") {
          detectedUrl = collectChromeUrlFromDevTools();
          if (detectedUrl && win) {
            win.url = detectedUrl;
          }
        }
      }

      if (!win) {
        try {
          win = await activeWindow();
        } catch {
          win = null;
        }

        detectedUrl = normalizeUrl(win?.url);
      }

      const state = resolveState(win, { detectedUrl });
      const changed = logger.observe(state, loopStartedAt);
      if (changed) {
        process.stdout.write(`[STATE] ${state.value}\n`);
      }

      const elapsedMs = Date.now() - loopStartedAt;
      const sleepFor = Math.max(15, intervalSeconds * 1000 - elapsedMs);
      await sleep(sleepFor);
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    logger.close();
  }
}
