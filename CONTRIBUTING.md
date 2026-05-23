# Contributing

Thanks for helping improve BotDrop Host.

## Development

```powershell
npm install
npm run dev
```

Before opening a pull request, run:

```powershell
npm run lint
npm run build
```

## Pull requests

- Keep changes focused.
- Include screenshots for UI changes.
- Do not commit secrets, bot tokens, `.env` files, build output, or `node_modules`.
- Prefer clear user-facing errors for beginner workflows.

## Security-sensitive changes

BotDrop Host runs local commands and handles bot tokens. Changes touching
process spawning, environment storage, log redaction, or preload IPC should be
kept small and reviewed carefully.
