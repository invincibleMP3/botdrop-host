export type BotProjectType = 'node' | 'python'
export type BotStatus =
  | 'offline'
  | 'installing'
  | 'starting'
  | 'online'
  | 'crashed'

export type EnvDraft = {
  discordToken: string
  clientId: string
  guildId: string
}

export type BotMetrics = {
  cpu: number
  memory: number
  uptime: number
}

export type BotView = {
  id: string
  name: string
  projectPath: string
  projectType: BotProjectType
  startCommand: string
  installCommand: string
  suggestedCommands: string[]
  autoRestart: boolean
  status: BotStatus
  logs: string[]
  hasDiscordToken: boolean
  clientId: string
  guildId: string
  restartCount: number
  lastCrashReason: string
  metrics: BotMetrics
  warnings: string[]
}

export type BotUpdate = {
  id: string
  name: string
  startCommand: string
  autoRestart: boolean
  env: EnvDraft
}

export type BotDropApi = {
  chooseProject: () => Promise<BotView | undefined>
  deleteBot: (id: string) => Promise<BotView[]>
  getDroppedPath: (file: File) => string
  importPaths: (paths: string[]) => Promise<BotView[]>
  listBots: () => Promise<BotView[]>
  onBotsChanged: (listener: (bots: BotView[]) => void) => () => void
  restartBot: (id: string) => Promise<BotView[]>
  startBot: (id: string) => Promise<BotView[]>
  stopBot: (id: string) => Promise<BotView[]>
  stopAllBots: () => Promise<BotView[]>
  updateBot: (update: BotUpdate) => Promise<BotView[]>
}
