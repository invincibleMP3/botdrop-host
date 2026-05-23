import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  Tray,
} from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import extract from 'extract-zip'
import pidusage from 'pidusage'
import type {
  BotMetrics,
  BotProjectType,
  BotStatus,
  BotUpdate,
  BotView,
} from '../src/shared/bots.js'

type StoredBot = {
  id: string
  name: string
  projectPath: string
  projectType: BotProjectType
  startCommand: string
  installCommand: string
  suggestedCommands: string[]
  autoRestart: boolean
  hasInstalled: boolean
  encryptedEnv: {
    discordToken?: string
    clientId?: string
    guildId?: string
  }
  restartCount: number
  lastCrashReason: string
}

type RuntimeBot = {
  process?: ChildProcessWithoutNullStreams
  logs: string[]
  metrics: BotMetrics
  status: BotStatus
  startedAt?: number
  stopRequested: boolean
  restartTimer?: NodeJS.Timeout
  statusTimer?: NodeJS.Timeout
  warning?: string
}

type ToolAvailability = Record<BotProjectType, string[]>

type ManagedProcess = {
  botId: string
  command: string
  pid: number
  projectPath: string
  startedAt: number
}

const moduleDir = dirname(fileURLToPath(import.meta.url))
const emptyMetrics = (): BotMetrics => ({ cpu: 0, memory: 0, uptime: 0 })
const storedBots = new Map<string, StoredBot>()
const runtimes = new Map<string, RuntimeBot>()
const managedProcesses = new Map<string, ManagedProcess>()
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let quitting = false
let toolAvailability: ToolAvailability = { node: [], python: [] }
let metricsTimer: NodeJS.Timeout | undefined
const hasSingleInstanceLock = app.requestSingleInstanceLock()

const dataFile = () => join(app.getPath('userData'), 'bots.json')
const processFile = () => join(app.getPath('userData'), 'processes.json')
const importedProjectsDir = () => join(app.getPath('userData'), 'projects')

if (!hasSingleInstanceLock) {
  app.quit()
}

function runtimeFor(id: string): RuntimeBot {
  const existing = runtimes.get(id)
  if (existing) return existing

  const runtime: RuntimeBot = {
    logs: [],
    metrics: emptyMetrics(),
    status: 'offline',
    stopRequested: false,
  }
  runtimes.set(id, runtime)
  return runtime
}

function appendLog(id: string, message: string): void {
  const runtime = runtimeFor(id)
  const bot = storedBots.get(id)
  const clean = redact(message, bot).replace(/\r/g, '')
  for (const line of clean.split('\n').filter(Boolean)) {
    runtime.logs.push(`[${new Date().toLocaleTimeString()}] ${line}`)
  }
  runtime.logs.splice(0, Math.max(0, runtime.logs.length - 350))
}

function decrypt(value?: string): string {
  if (!value) return ''
  try {
    if (value.startsWith('safe:')) {
      return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'))
    }
    if (value.startsWith('plain:')) {
      return Buffer.from(value.slice(6), 'base64').toString('utf8')
    }
  } catch {
    return ''
  }
  return ''
}

function encrypt(value: string): string | undefined {
  if (!value) return undefined
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(value).toString('base64')}`
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
}

function redact(message: string, bot?: StoredBot): string {
  const env = bot?.encryptedEnv
  const secret = decrypt(env?.discordToken)
  const escapedSecret = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tokenPattern = /[A-Za-z\d_-]{20,}\.[A-Za-z\d_-]{6,}\.[A-Za-z\d_-]{20,}/g
  const withKnownSecret = escapedSecret
    ? message.replace(new RegExp(escapedSecret, 'g'), '[DISCORD_TOKEN]')
    : message
  return withKnownSecret.replace(tokenPattern, '[DISCORD_TOKEN]')
}

function envFor(bot: StoredBot): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const discordToken = decrypt(bot.encryptedEnv.discordToken)
  const clientId = decrypt(bot.encryptedEnv.clientId)
  const guildId = decrypt(bot.encryptedEnv.guildId)
  if (discordToken) env.DISCORD_TOKEN = discordToken
  if (clientId) env.CLIENT_ID = clientId
  if (guildId) env.GUILD_ID = guildId
  return env
}

async function saveBots(): Promise<void> {
  await fs.mkdir(dirname(dataFile()), { recursive: true })
  await fs.writeFile(
    dataFile(),
    JSON.stringify({ bots: [...storedBots.values()] }, null, 2),
    'utf8',
  )
}

async function saveManagedProcesses(): Promise<void> {
  await fs.mkdir(dirname(processFile()), { recursive: true })
  await fs.writeFile(
    processFile(),
    JSON.stringify({ processes: [...managedProcesses.values()] }, null, 2),
    'utf8',
  )
}

async function loadManagedProcesses(): Promise<void> {
  try {
    const raw = await fs.readFile(processFile(), 'utf8')
    const parsed = JSON.parse(raw) as { processes?: ManagedProcess[] }
    managedProcesses.clear()
    for (const processInfo of parsed.processes ?? []) {
      if (processInfo.pid > 0) {
        managedProcesses.set(String(processInfo.pid), processInfo)
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function loadBots(): Promise<void> {
  try {
    const raw = await fs.readFile(dataFile(), 'utf8')
    const parsed = JSON.parse(raw) as { bots?: StoredBot[] }
    for (const bot of parsed.bots ?? []) {
      storedBots.set(bot.id, bot)
      runtimeFor(bot.id)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function viewFor(bot: StoredBot): BotView {
  const runtime = runtimeFor(bot.id)
  return {
    id: bot.id,
    name: bot.name,
    projectPath: bot.projectPath,
    projectType: bot.projectType,
    startCommand: bot.startCommand,
    installCommand: bot.installCommand,
    suggestedCommands: bot.suggestedCommands,
    autoRestart: bot.autoRestart,
    status: runtime.status,
    logs: runtime.logs,
    hasDiscordToken: Boolean(decrypt(bot.encryptedEnv.discordToken)),
    clientId: decrypt(bot.encryptedEnv.clientId),
    guildId: decrypt(bot.encryptedEnv.guildId),
    restartCount: bot.restartCount,
    lastCrashReason: bot.lastCrashReason,
    metrics: runtime.metrics,
    warnings: [...toolAvailability[bot.projectType], runtime.warning].filter(
      (warning): warning is string => Boolean(warning),
    ),
  }
}

function currentViews(): BotView[] {
  return [...storedBots.values()].map(viewFor)
}

function sendViews(): BotView[] {
  const views = currentViews()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bots:changed', views)
  }
  return views
}

async function commandExists(command: string): Promise<boolean> {
  return new Promise((done) => {
    const probe = spawn(`${command} --version`, {
      shell: process.platform === 'win32',
      stdio: 'ignore',
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      probe.kill()
      done(false)
    }, 2500)
    probe.once('error', () => {
      clearTimeout(timer)
      done(false)
    })
    probe.once('exit', (code) => {
      clearTimeout(timer)
      done(code === 0)
    })
  })
}

async function refreshTools(): Promise<void> {
  const [hasNode, hasNpm, hasPython] = await Promise.all([
    commandExists('node'),
    commandExists('npm'),
    commandExists('python'),
  ])
  toolAvailability = {
    node: [
      !hasNode && 'Node.js was not found. Install Node.js from nodejs.org.',
      !hasNpm && 'npm was not found. Reinstall Node.js with npm enabled.',
    ].filter((warning): warning is string => Boolean(warning)),
    python: [
      !hasPython &&
        'Python was not found. Install Python and enable "Add python.exe to PATH".',
    ].filter((warning): warning is string => Boolean(warning)),
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function detectType(projectPath: string): Promise<BotProjectType | undefined> {
  if (await pathExists(join(projectPath, 'package.json'))) return 'node'
  const pythonMarkers = ['requirements.txt', 'pyproject.toml', 'main.py']
  if (
    (await Promise.all(
      pythonMarkers.map((marker) => pathExists(join(projectPath, marker))),
    )).some(Boolean)
  ) {
    return 'python'
  }
  return undefined
}

async function findProjectRoot(path: string): Promise<{
  path: string
  type: BotProjectType
}> {
  const directType = await detectType(path)
  if (directType) return { path, type: directType }

  const entries = await fs.readdir(path, { withFileTypes: true })
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const candidate = join(path, entry.name)
    const candidateType = await detectType(candidate)
    if (candidateType) return { path: candidate, type: candidateType }
  }
  throw new Error(
    'No bot project was detected. Drop a folder or zip with package.json, requirements.txt, pyproject.toml, or main.py.',
  )
}

async function prepareImport(input: string): Promise<{
  path: string
  type: BotProjectType
}> {
  const absoluteInput = resolve(input)
  const stat = await fs.stat(absoluteInput)
  if (stat.isFile() && extname(absoluteInput).toLowerCase() === '.zip') {
    const destination = join(importedProjectsDir(), randomUUID())
    await fs.mkdir(destination, { recursive: true })
    await extract(absoluteInput, { dir: destination })
    return findProjectRoot(destination)
  }
  return findProjectRoot(stat.isDirectory() ? absoluteInput : dirname(absoluteInput))
}

async function commandsFor(path: string, type: BotProjectType): Promise<{
  installCommand: string
  suggestedCommands: string[]
}> {
  if (type === 'python') {
    return {
      installCommand: (await pathExists(join(path, 'requirements.txt')))
        ? 'python -m pip install -r requirements.txt'
        : '',
      suggestedCommands: ['python main.py', 'python bot.py'],
    }
  }

  const packageJson = await fs
    .readFile(join(path, 'package.json'), 'utf8')
    .then((raw) => JSON.parse(raw) as { scripts?: Record<string, string> })
  return {
    installCommand: 'npm install',
    suggestedCommands: [
      packageJson.scripts?.start && 'npm start',
      'node index.js',
      'node bot.js',
    ].filter((command): command is string => Boolean(command)),
  }
}

async function importBot(input: string): Promise<StoredBot> {
  const project = await prepareImport(input)
  const commands = await commandsFor(project.path, project.type)
  const bot: StoredBot = {
    id: randomUUID(),
    name: project.path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Discord Bot',
    projectPath: project.path,
    projectType: project.type,
    installCommand: commands.installCommand,
    suggestedCommands: commands.suggestedCommands,
    startCommand: commands.suggestedCommands[0],
    autoRestart: true,
    hasInstalled: false,
    encryptedEnv: {},
    restartCount: 0,
    lastCrashReason: '',
  }
  storedBots.set(bot.id, bot)
  appendLog(bot.id, `Imported ${project.type} project from ${project.path}.`)
  return bot
}

function runCommand(
  id: string,
  command: string,
  env: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  const bot = storedBots.get(id)
  if (!bot) throw new Error('Bot was removed.')
  appendLog(id, `$ ${command}`)
  const child = spawn(command, {
    cwd: bot.projectPath,
    env,
    shell: true,
    windowsHide: true,
  })
  child.stdout.on('data', (chunk: Buffer) => appendLog(id, chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => appendLog(id, chunk.toString()))
  child.on('error', (error) => appendLog(id, error.message))
  if (child.pid) {
    managedProcesses.set(String(child.pid), {
      botId: id,
      command,
      pid: child.pid,
      projectPath: bot.projectPath,
      startedAt: Date.now(),
    })
    void saveManagedProcesses()
  }
  return child
}

async function terminatePid(pid: number): Promise<void> {
  if (!pid || pid === process.pid) return
  if (process.platform === 'win32') {
    await new Promise<void>((done) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
      })
      killer.once('exit', () => done())
      killer.once('error', () => done())
    })
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Process is already gone.
  }
}

async function terminate(child?: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child?.pid || child.killed) return
  await terminatePid(child.pid)
  managedProcesses.delete(String(child.pid))
  await saveManagedProcesses()
}

async function stopManagedBotProcesses(botId?: string): Promise<void> {
  await loadManagedProcesses()
  const targets = [...managedProcesses.values()].filter(
    (processInfo) => !botId || processInfo.botId === botId,
  )
  await Promise.all(targets.map((processInfo) => terminatePid(processInfo.pid)))
  for (const processInfo of targets) {
    managedProcesses.delete(String(processInfo.pid))
  }
  await saveManagedProcesses()
}

async function installThenStart(id: string): Promise<void> {
  const bot = storedBots.get(id)
  if (!bot) return
  const runtime = runtimeFor(id)
  runtime.stopRequested = false
  runtime.warning = undefined
  clearTimeout(runtime.restartTimer)
  if (runtime.process) return
  await stopManagedBotProcesses(id)

  await refreshTools()
  if (toolAvailability[bot.projectType].length) {
    runtime.warning = toolAvailability[bot.projectType][0]
    appendLog(id, runtime.warning)
    runtime.status = 'crashed'
    sendViews()
    return
  }

  const installCommand = bot.installCommand
  if (!bot.hasInstalled && installCommand) {
    runtime.status = 'installing'
    sendViews()
    const installer = runCommand(id, installCommand, envFor(bot))
    runtime.process = installer
    installer.once('exit', async (code) => {
      if (installer.pid) managedProcesses.delete(String(installer.pid))
      await saveManagedProcesses()
      runtime.process = undefined
      if (runtime.stopRequested) {
        runtime.status = 'offline'
        sendViews()
        return
      }
      if (code !== 0) {
        crashBot(id, `Dependency install exited with code ${code ?? 'unknown'}.`)
        return
      }
      bot.hasInstalled = true
      await saveBots()
      startProcess(id)
    })
    return
  }

  startProcess(id)
}

function startProcess(id: string): void {
  const bot = storedBots.get(id)
  if (!bot) return
  const runtime = runtimeFor(id)
  runtime.status = 'starting'
  runtime.startedAt = Date.now()
  runtime.metrics = emptyMetrics()
  sendViews()

  const child = runCommand(id, bot.startCommand, envFor(bot))
  runtime.process = child
  runtime.statusTimer = setTimeout(() => {
    if (runtime.process === child && runtime.status === 'starting') {
      runtime.status = 'online'
      appendLog(id, 'Bot process is running.')
      sendViews()
    }
  }, 1200)
  child.once('exit', (code, signal) => {
    clearTimeout(runtime.statusTimer)
    if (child.pid) {
      managedProcesses.delete(String(child.pid))
      void saveManagedProcesses()
    }
    if (runtime.process === child) runtime.process = undefined
    runtime.metrics = emptyMetrics()
    if (runtime.stopRequested) {
      runtime.status = 'offline'
      appendLog(id, 'Bot stopped.')
      sendViews()
      return
    }
    crashBot(
      id,
      `Bot exited with ${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}.`,
    )
  })
}

function crashBot(id: string, reason: string): void {
  const bot = storedBots.get(id)
  if (!bot) return
  const runtime = runtimeFor(id)
  runtime.status = 'crashed'
  runtime.startedAt = undefined
  bot.lastCrashReason = reason
  appendLog(id, reason)
  void saveBots()
  sendViews()
  if (!bot.autoRestart || quitting) return
  appendLog(id, 'Auto-restart scheduled in 3 seconds.')
  runtime.restartTimer = setTimeout(() => {
    bot.restartCount += 1
    appendLog(id, 'Auto-restarting bot.')
    void saveBots()
    void installThenStart(id)
  }, 3000)
}

async function stopBot(id: string): Promise<void> {
  const runtime = runtimeFor(id)
  clearTimeout(runtime.restartTimer)
  runtime.stopRequested = true
  if (!runtime.process) {
    await stopManagedBotProcesses(id)
    runtime.status = 'offline'
    runtime.startedAt = undefined
    runtime.metrics = emptyMetrics()
    sendViews()
    return
  }
  appendLog(id, 'Stopping process tree.')
  await terminate(runtime.process)
}

async function restartBot(id: string): Promise<void> {
  const bot = storedBots.get(id)
  if (!bot) return
  bot.restartCount += 1
  await stopBot(id)
  await saveBots()
  setTimeout(() => void installThenStart(id), 350)
}

async function refreshMetrics(): Promise<void> {
  await Promise.all(
    [...storedBots.keys()].map(async (id) => {
      const runtime = runtimeFor(id)
      const pid = runtime.process?.pid
      if (!pid || !runtime.startedAt) return
      try {
        const stats = await pidusage(pid)
        runtime.metrics = {
          cpu: stats.cpu,
          memory: stats.memory,
          uptime: Date.now() - runtime.startedAt,
        }
      } catch {
        runtime.metrics.uptime = Date.now() - runtime.startedAt
      }
    }),
  )
  sendViews()
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: '#11131a',
    height: 860,
    minHeight: 680,
    minWidth: 900,
    show: false,
    title: 'BotDrop Host',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(moduleDir, 'preload.js'),
      sandbox: false,
    },
    width: 1420,
  })

  window.once('ready-to-show', () => {
    window.maximize()
    window.show()
    window.focus()
  })
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`Renderer failed to load ${url}: ${code} ${description}`)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Renderer process stopped: ${details.reason}`)
  })
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.error(`Renderer: ${message}`)
  })
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window.hide()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(join(moduleDir, '../../dist/index.html'))
  }
  return window
}

function createTray(): Tray {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAvUlEQVR4Ae2TMQ6DMAxFvVJhYKdeAEdhYO8RWMLOiYVbF8qQAoZGOVSlKOIn+dn2s/0A7JfVaum4KQqMp5ssSUgrU4g7oWteoYK7ss4qOBUHoIwdoHObRZ9qa/cTmgmD/gBZY8EDQDFz+u5RcxXpkLYONrgAcC5PDGQDcEyWkhJvLXgASDMY06BNdZ8uLjhBQmvNIu1w/1zB0lZCUor3xAMQZhjTR1MZeqrHqBDHgz6AMnAA0MwcxtKWBWDs/9slsz4BQFZRx1Qnzc4AAAAASUVORK5CYII=',
  )
  const nextTray = new Tray(icon)
  nextTray.setToolTip('BotDrop Host')
  nextTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open App',
        click: () => {
          mainWindow ??= createWindow()
          mainWindow.show()
          mainWindow.focus()
        },
      },
      {
        label: 'Stop All Bots',
        click: async () => {
          await Promise.all([...storedBots.keys()].map(stopBot))
          await stopManagedBotProcesses()
        },
      },
      {
        label: 'Stop Orphaned Bot Processes',
        click: () => void stopManagedBotProcesses(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: async () => {
          quitting = true
          await Promise.all([...storedBots.keys()].map(stopBot))
          await stopManagedBotProcesses()
          app.quit()
        },
      },
    ]),
  )
  nextTray.on('double-click', () => {
    mainWindow ??= createWindow()
    mainWindow.show()
  })
  return nextTray
}

function registerIpc(): void {
  ipcMain.handle('bots:list', () => currentViews())
  ipcMain.handle('bots:choose-project', async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Bot projects', extensions: ['zip'] }],
      properties: ['openDirectory', 'openFile'],
      title: 'Choose a bot folder or zip',
    })
    if (result.canceled || !result.filePaths[0]) return undefined
    const bot = await importBot(result.filePaths[0])
    await saveBots()
    sendViews()
    return viewFor(bot)
  })
  ipcMain.handle('bots:import-paths', async (_event, paths: string[]) => {
    for (const path of [...new Set(paths)].filter(Boolean)) await importBot(path)
    await saveBots()
    return sendViews()
  })
  ipcMain.handle('bots:update', async (_event, update: BotUpdate) => {
    const bot = storedBots.get(update.id)
    if (!bot) return currentViews()
    bot.name = update.name.trim() || bot.name
    bot.startCommand = update.startCommand.trim() || bot.startCommand
    bot.autoRestart = update.autoRestart
    if (update.env.discordToken.trim()) {
      bot.encryptedEnv.discordToken = encrypt(update.env.discordToken.trim())
    }
    bot.encryptedEnv.clientId = encrypt(update.env.clientId.trim())
    bot.encryptedEnv.guildId = encrypt(update.env.guildId.trim())
    await saveBots()
    appendLog(bot.id, 'Bot settings saved.')
    return sendViews()
  })
  ipcMain.handle('bots:start', async (_event, id: string) => {
    await installThenStart(id)
    return sendViews()
  })
  ipcMain.handle('bots:stop', async (_event, id: string) => {
    await stopBot(id)
    return sendViews()
  })
  ipcMain.handle('bots:stop-all', async () => {
    await Promise.all([...storedBots.keys()].map(stopBot))
    await stopManagedBotProcesses()
    return sendViews()
  })
  ipcMain.handle('bots:restart', async (_event, id: string) => {
    await restartBot(id)
    return sendViews()
  })
  ipcMain.handle('bots:delete', async (_event, id: string) => {
    await stopBot(id)
    storedBots.delete(id)
    runtimes.delete(id)
    await saveBots()
    return sendViews()
  })
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    mainWindow ??= createWindow()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    await loadManagedProcesses()
    await stopManagedBotProcesses()
    await loadBots()
    await refreshTools()
    registerIpc()
    mainWindow = createWindow()
    tray = createTray()
    metricsTimer = setInterval(() => void refreshMetrics(), 2000)
  })

  app.on('activate', () => {
    mainWindow ??= createWindow()
    mainWindow.show()
  })
}

app.on('window-all-closed', () => {
  // Keep the main process and tray alive until the tray Quit command is used.
})

app.on('before-quit', () => {
  quitting = true
  clearInterval(metricsTimer)
  tray?.destroy()
  void stopManagedBotProcesses()
})
