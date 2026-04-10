# dr-state-logger

Cross-platform active window and browser tab transition logger.

Primary target: exam monitoring with one command.

## Command

After publish, users run:

npx dr-state-logger

## What Gets Logged

- App switches (VS Code, File Explorer, etc.)
- Browser tab switches by tab title
- Browser URL when available
- Timestamped transitions in this format:

`timestamp | current_state ----> next_state`

Default output file:

- Windows: `%USERPROFILE%\\Downloads\\proctor_state_transitions.log`
- Linux/macOS: `$HOME/Downloads/proctor_state_transitions.log` (fallback if folder missing)

## Usage

Basic:

npx dr-state-logger

Custom interval:

npx dr-state-logger --interval-seconds 0.5

Custom output path:

npx dr-state-logger --output "C:\\Users\\Public\\Downloads\\faculty_exam_log.log"

Help:

npx dr-state-logger --help

## Local Development

From this folder:

npm install
npm run check
node ./bin/dr-state-logger.js --interval-seconds 1

## Publish (One-Time)

1. Create npm account and login:
   npm login
2. Ensure package name is still free:
   npm view dr-state-logger
3. Publish:
   npm publish --access public

After this, anyone can run:

npx dr-state-logger

## Notes About Browser URL Detection

- Windows: URL capture uses active-window info plus foreground window automation fallback.
- Linux: active window detection works best on X11. Wayland often blocks active-window introspection.
- macOS: tab URL visibility depends on OS permissions and browser support.

When URL is blocked by OS/browser policy, tab title is still logged where available.

## Faculty Quick Test Flow

1. Open terminal.
2. Run: `npx dr-state-logger`
3. Switch between browser tabs (ChatGPT, Gemini, Google, YouTube, etc.) and other apps.
4. Stop with Ctrl+C.
5. Open Downloads and check `proctor_state_transitions.log`.
