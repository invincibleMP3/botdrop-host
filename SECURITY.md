# Security Policy

## Supported versions

Only the latest `main` branch is supported during early development.

## Reporting a vulnerability

Please do not open public issues for vulnerabilities involving token handling,
process execution, or local file access.

Report privately by contacting the maintainer through GitHub, then include:

- A short summary of the issue.
- Steps to reproduce.
- Impact and affected platform.
- Suggested fix, if known.

## Token safety

BotDrop Host attempts to store Discord bot tokens with Electron `safeStorage`
when OS encryption is available. Logs are redacted before being shown in the UI,
but users should still avoid pasting tokens into public issues, screenshots, or
support channels.
