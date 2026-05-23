# BotDrop Host

BotDrop Host is a local Electron desktop host for Discord bot projects. Drop a bot
folder or zip into the app, set its environment values, and manage installs,
starts, logs, crashes, and restarts from one desktop UI.

## Features

- Imports folders and `.zip` projects with drag and drop or File Explorer.
- Detects Node.js projects from `package.json`.
- Detects Python projects from `requirements.txt`, `pyproject.toml`, or
  `main.py`.
- Suggests common start commands and keeps the chosen command editable.
- Runs `npm install` for Node.js projects before their first start.
- Runs `python -m pip install -r requirements.txt` before the first Python
  start when `requirements.txt` exists.
- Saves multiple bot entries between launches.
- Keeps bot processes alive when the window is closed to the tray.
- Provides tray actions for Open App, Stop All Bots, and Quit.
- Shows live logs, status, uptime, memory, CPU, restart count, and last crash.
- Supports opt-in auto restart per bot. It is enabled for new imports.

## Token and environment handling

The renderer never starts bot processes directly. Bot commands, environment
storage, log redaction, and child process ownership live in Electron's main
process behind a preload IPC API.

The Discord token input is masked and a saved token is not sent back to the UI.
Logs redact the stored token and token-shaped Discord strings before they are
shown in the terminal panel. Environment values are encrypted with Electron
`safeStorage` when OS encryption is available. If the OS secure storage backend
is unavailable, the app falls back to local encoded storage so users can still
run bots; that fallback is not equivalent to OS-backed encryption.

Bot records are saved under Electron's per-user app data directory. Zip imports
are extracted into that app data directory; folder imports continue to point at
the folder selected from disk.

## Requirements

- Node.js and npm for building BotDrop Host and running Node.js bots.
- Python on `PATH` for running Python bots.
- A Discord bot project that reads values such as `DISCORD_TOKEN`, `CLIENT_ID`,
  and `GUILD_ID` from environment variables.

When a required runtime is missing, BotDrop Host shows a warning in the selected
bot panel before it attempts to run the project.

## Development

```powershell
npm install
npm run dev
```

The dev command starts the Vite renderer, compiles the Electron main/preload
TypeScript, and launches Electron.

## Checks

```powershell
npm run lint
npm run build
```

## Windows build

```powershell
npm run dist:win
```

Electron Builder writes Windows NSIS and portable artifacts into `release/`.
The app targets local Windows hosting but the process-management code also keeps
a non-Windows termination path for development.

## Using the app

1. Drop a bot folder or zip into the import zone.
2. Select the bot from the left sidebar.
3. Choose or edit the start command.
4. Enter the environment values the project expects and save settings.
5. Start the bot and watch the console/status panel.

Closing the app window hides it. Use the system tray menu's **Quit** action when
you want BotDrop Host to stop all bot processes and fully exit.
