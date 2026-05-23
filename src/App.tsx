import {
  Bot,
  ChevronDown,
  CircleAlert,
  Check,
  FolderPlus,
  HardDriveUpload,
  Play,
  RefreshCw,
  Save,
  Square,
  SquareStack,
  Trash2,
} from 'lucide-react'
import {
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { BotStatus, BotView, EnvDraft } from './shared/bots'

const emptyEnv: EnvDraft = { discordToken: '', clientId: '', guildId: '' }

const statusClass: Record<BotStatus, string> = {
  crashed: 'border-rose-400/25 bg-rose-400/15 text-rose-100',
  installing: 'border-amber-300/25 bg-amber-300/15 text-amber-100',
  offline: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  online: 'border-emerald-300/25 bg-emerald-300/15 text-emerald-100',
  starting: 'border-cyan-300/25 bg-cyan-300/15 text-cyan-100',
}

function bytes(value: number): string {
  if (!value) return '0 MB'
  return `${(value / 1024 / 1024).toFixed(value > 1024 ** 3 ? 1 : 0)} MB`
}

function uptime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Idle'
  const seconds = Math.floor(value / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds % 60}s`
}

function App() {
  if (!window.botdrop) {
    return (
      <div className="grid h-screen place-items-center bg-[#101219] p-8 text-slate-100">
        <div className="max-w-xl rounded-lg border border-rose-300/25 bg-rose-300/10 p-6 text-left">
          <h1 className="text-2xl font-semibold">BotDrop Host could not load</h1>
          <p className="mt-3 leading-7 text-rose-50/90">
            The Electron preload bridge is unavailable. Close this window, run
            <code className="mx-2 rounded bg-black/30 px-2 py-1">launch.bat</code>
            again, and check the launcher output for renderer errors.
          </p>
        </div>
      </div>
    )
  }

  return <HostApp />
}

function HostApp() {
  const [bots, setBots] = useState<BotView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = bots.find((bot) => bot.id === selectedId)

  useEffect(() => {
    void window.botdrop.listBots().then((next) => {
      setBots(next)
      setSelectedId((current) => current || next[0]?.id || '')
    })
    return window.botdrop.onBotsChanged((next) => {
      setBots(next)
      setSelectedId((current) =>
        next.some((bot) => bot.id === current) ? current : next[0]?.id || '',
      )
    })
  }, [])

  async function run(task: () => Promise<BotView[]>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      setBots(await task())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  async function importFiles(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    setDropActive(false)
    const paths = [...event.dataTransfer.files]
      .map((file) => window.botdrop.getDroppedPath(file))
      .filter(Boolean)
    if (!paths.length) {
      setError('Drop a bot folder or zip file from File Explorer.')
      return
    }
    await run(async () => {
      const next = await window.botdrop.importPaths(paths)
      setSelectedId(next.at(-1)?.id || selectedId)
      return next
    })
  }

  async function chooseProject(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const bot = await window.botdrop.chooseProject()
      if (bot) setSelectedId(bot.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-screen min-h-[560px] overflow-hidden bg-[#101219] text-slate-100 max-lg:flex-col">
      <aside className="flex w-[310px] shrink-0 flex-col border-r border-white/10 bg-[#151822] max-lg:h-auto max-lg:w-full max-lg:border-b max-lg:border-r-0">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-[#5865f2] shadow-lg shadow-[#5865f2]/20">
              <Bot className="size-6" />
            </span>
            <div className="min-w-0 text-left">
              <h1 className="text-xl font-semibold">BotDrop Host</h1>
              <p className="text-sm text-slate-400">Local Discord bot fleet</p>
            </div>
          </div>
          <button
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-medium transition hover:bg-white/15 disabled:opacity-50"
            disabled={busy}
            onClick={() => void chooseProject()}
            type="button"
          >
            <FolderPlus className="size-4" />
            Add folder or zip
          </button>
          <button
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-400/12 px-3 text-sm font-medium text-rose-100 transition hover:bg-rose-400/18 disabled:opacity-50"
            disabled={busy || bots.length === 0}
            onClick={() => void run(() => window.botdrop.stopAllBots())}
            type="button"
          >
            <SquareStack className="size-4" />
            Stop all instances
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 max-lg:flex max-lg:gap-2 max-lg:space-y-0 max-lg:overflow-x-auto">
          {bots.map((bot) => (
            <button
              className={`w-full rounded-lg border px-3 py-3 text-left transition max-lg:min-w-64 ${
                bot.id === selectedId
                  ? 'border-[#5865f2]/60 bg-[#5865f2]/18'
                  : 'border-transparent bg-white/[0.035] hover:border-white/10 hover:bg-white/[0.07]'
              }`}
              key={bot.id}
              onClick={() => setSelectedId(bot.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="truncate font-medium">{bot.name}</span>
                <Status status={bot.status} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span className="uppercase">{bot.projectType}</span>
                <span>{uptime(bot.metrics.uptime)}</span>
              </div>
            </button>
          ))}
          {!bots.length && (
            <p className="px-2 py-5 text-left text-sm leading-6 text-slate-400">
              Imported bots stay here after the app is reopened.
            </p>
          )}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto max-lg:min-h-0">
        <div className="mx-auto flex min-h-full max-w-[1280px] flex-col gap-5 p-5">
          <DropZone
            active={dropActive}
            onDragActive={setDropActive}
            onDrop={(event) => void importFiles(event)}
            onPick={() => void chooseProject()}
          />
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {selected ? (
            <BotPanel bot={selected} busy={busy} key={selected.id} run={run} />
          ) : (
            <section className="grid flex-1 place-items-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <div>
                <Bot className="mx-auto size-11 text-slate-400" />
                <h2 className="mt-4 text-xl font-semibold">No bot selected</h2>
                <p className="mt-2 text-slate-400">
                  Drop a project folder or zip to create a local host entry.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

function Status({ status }: { status: BotStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusClass[status]}`}
    >
      {status}
    </span>
  )
}

function DropZone({
  active,
  onDragActive,
  onDrop,
  onPick,
}: {
  active: boolean
  onDragActive: (active: boolean) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onPick: () => void
}) {
  return (
    <div
      className={`grid min-h-36 place-items-center rounded-lg border border-dashed px-6 py-5 text-center transition ${
        active
          ? 'border-[#5865f2] bg-[#5865f2]/15'
          : 'border-white/20 bg-[#191e2a] hover:border-white/35'
      }`}
      onDragEnter={(event) => {
        event.preventDefault()
        onDragActive(true)
      }}
      onDragLeave={() => onDragActive(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div>
        <HardDriveUpload className="mx-auto size-8 text-cyan-200" />
        <p className="mt-3 text-lg font-semibold">Drop a Discord bot folder or zip</p>
        <button
          className="mt-2 text-sm font-medium text-[#8ea1ff] underline decoration-[#8ea1ff]/40 underline-offset-4"
          onClick={onPick}
          type="button"
        >
          Browse from File Explorer
        </button>
      </div>
    </div>
  )
}

function BotPanel({
  bot,
  busy,
  run,
}: {
  bot: BotView
  busy: boolean
  run: (task: () => Promise<BotView[]>) => Promise<void>
}) {
  const [name, setName] = useState(bot.name)
  const [startCommand, setStartCommand] = useState(bot.startCommand)
  const [autoRestart, setAutoRestart] = useState(bot.autoRestart)
  const [env, setEnv] = useState<EnvDraft>({
    ...emptyEnv,
    clientId: bot.clientId,
    guildId: bot.guildId,
  })

  const canStart = bot.status === 'offline' || bot.status === 'crashed'
  const isCustomCommand = !bot.suggestedCommands.includes(startCommand)
  const title = useMemo(
    () => bot.projectPath.split(/[\\/]/).filter(Boolean).slice(-2).join('\\'),
    [bot.projectPath],
  )

  async function save(): Promise<void> {
    await run(() =>
      window.botdrop.updateBot({
        id: bot.id,
        name,
        startCommand,
        autoRestart,
        env,
      }),
    )
    setEnv((current) => ({ ...current, discordToken: '' }))
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete "${bot.name}" from BotDrop Host?`)) return
    await run(() => window.botdrop.deleteBot(bot.id))
  }

  return (
    <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(390px,0.9fr)_minmax(480px,1.1fr)]">
      <section className="space-y-5">
        <div className="rounded-lg border border-white/10 bg-[#171b26] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold">{bot.name}</h2>
                <Status status={bot.status} />
              </div>
              <p className="mt-1 truncate text-sm text-slate-400" title={bot.projectPath}>
                {title}
              </p>
            </div>
            <div className="flex gap-2">
              <ActionButton
                disabled={busy || !canStart}
                icon={<Play />}
                label="Start Bot"
                onClick={() => void run(() => window.botdrop.startBot(bot.id))}
                tone="start"
              />
              <ActionButton
                disabled={busy || bot.status === 'offline'}
                icon={<Square />}
                label="Stop Bot"
                onClick={() => void run(() => window.botdrop.stopBot(bot.id))}
              />
              <ActionButton
                disabled={busy}
                icon={<RefreshCw />}
                label="Restart Bot"
                onClick={() => void run(() => window.botdrop.restartBot(bot.id))}
              />
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Metric label="Uptime" value={uptime(bot.metrics.uptime)} />
            <Metric label="Memory" value={bytes(bot.metrics.memory)} />
            <Metric label="CPU" value={`${bot.metrics.cpu.toFixed(1)}%`} />
            <Metric label="Restarts" value={String(bot.restartCount)} />
          </div>
          <div className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-left text-sm">
            <span className="text-slate-400">Last crash: </span>
            <span className={bot.lastCrashReason ? 'text-rose-100' : 'text-slate-300'}>
              {bot.lastCrashReason || 'None'}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#171b26] p-5 text-left">
          <div className="grid gap-4 sm:grid-cols-2">
            <Label title="Bot name">
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </Label>
            <Label title="Project type">
              <input disabled value={bot.projectType === 'node' ? 'Node.js' : 'Python'} />
            </Label>
          </div>
          <div className="mt-4 grid gap-4">
            <Label title="Start command">
              <CommandDropdown
                customActive={isCustomCommand}
                onCustom={() => {
                  if (!isCustomCommand) setStartCommand('')
                }}
                onSelect={setStartCommand}
                options={bot.suggestedCommands}
                value={startCommand}
              />
            </Label>
            <Label title="Command">
              <input
                value={startCommand}
                onChange={(event) => setStartCommand(event.target.value)}
              />
            </Label>
          </div>
          <label className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-white/[0.045] px-3 py-3">
            <span>
              <span className="block font-medium">Auto-restart crashes</span>
              <span className="block text-sm text-slate-400">
                Re-launch the bot after an unexpected exit.
              </span>
            </span>
            <input
              checked={autoRestart}
              className="size-5 accent-[#42d392]"
              onChange={(event) => setAutoRestart(event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#171b26] p-5 text-left">
          <h3 className="text-lg font-semibold">Environment</h3>
          <p className="mt-1 text-sm text-slate-400">
            Token values are encrypted with OS secure storage when available.
          </p>
          <div className="mt-4 grid gap-3">
            <Label title="DISCORD_TOKEN">
              <input
                autoComplete="off"
                onChange={(event) =>
                  setEnv((current) => ({ ...current, discordToken: event.target.value }))
                }
                placeholder={bot.hasDiscordToken ? 'Stored securely' : 'Paste token'}
                type="password"
                value={env.discordToken}
              />
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label title="CLIENT_ID">
                <input
                  onChange={(event) =>
                    setEnv((current) => ({ ...current, clientId: event.target.value }))
                  }
                  value={env.clientId}
                />
              </Label>
              <Label title="GUILD_ID">
                <input
                  onChange={(event) =>
                    setEnv((current) => ({ ...current, guildId: event.target.value }))
                  }
                  value={env.guildId}
                />
              </Label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              disabled={busy || !startCommand.trim()}
              icon={<Save />}
              label="Save Settings"
              onClick={() => void save()}
              tone="save"
            />
            <ActionButton
              disabled={busy}
              icon={<Trash2 />}
              label="Delete Bot"
              onClick={() => void remove()}
            />
          </div>
        </div>
      </section>
      <section className="flex min-h-[420px] flex-col gap-5">
        {bot.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-left text-sm text-amber-50">
            {bot.warnings.map((warning) => (
              <div className="flex gap-2" key={warning}>
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b0e14]">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2 rounded-full bg-rose-400" />
              <span className="size-2 rounded-full bg-amber-300" />
              <span className="size-2 rounded-full bg-emerald-300" />
              <span className="ml-2">Live Console</span>
            </div>
            <code className="truncate text-xs text-slate-400">{bot.installCommand || 'No install step'}</code>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-left font-mono text-[13px] leading-6 text-slate-200">
            {bot.logs.join('\n') || 'Logs appear here when the bot starts.'}
          </pre>
        </div>
      </section>
    </div>
  )
}

function Label({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{title}</span>
      {children}
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.045] px-3 py-3 text-left">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
    </div>
  )
}

function CommandDropdown({
  customActive,
  onCustom,
  onSelect,
  options,
  value,
}: {
  customActive: boolean
  onCustom: () => void
  onSelect: (command: string) => void
  options: string[]
  value: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const label = customActive ? 'Custom command' : value

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        className={`flex h-12 w-full items-center justify-between rounded-lg border px-3 text-left font-mono text-sm transition ${
          open
            ? 'border-[#8ea1ff] bg-[#0d111b] shadow-[0_0_0_3px_rgba(88,101,242,0.24)]'
            : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-black/40'
        }`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="truncate text-slate-100">{label}</span>
        <ChevronDown
          className={`ml-3 size-4 shrink-0 text-slate-300 transition ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-lg border border-white/10 bg-[#0d111b] p-1.5 shadow-2xl shadow-black/45">
          {options.map((command) => (
            <DropdownOption
              active={!customActive && value === command}
              key={command}
              label={command}
              onClick={() => {
                onSelect(command)
                setOpen(false)
              }}
            />
          ))}
          <div className="my-1 h-px bg-white/10" />
          <DropdownOption
            active={customActive}
            label="Custom command"
            onClick={() => {
              onCustom()
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

function DropdownOption({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`flex h-10 w-full items-center justify-between rounded-md px-3 text-left font-mono text-sm transition ${
        active
          ? 'bg-[#5865f2] text-white shadow-sm shadow-[#5865f2]/25'
          : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="truncate">{label}</span>
      {active && <Check className="ml-3 size-4 shrink-0" />}
    </button>
  )
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
  tone,
}: {
  disabled: boolean
  icon: React.ReactElement
  label: string
  onClick: () => void
  tone?: 'save' | 'start'
}) {
  const color =
    tone === 'start'
      ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
      : tone === 'save'
        ? 'bg-[#5865f2] text-white hover:bg-[#6975ff]'
        : 'bg-white/10 text-slate-100 hover:bg-white/15'
  return (
    <button
      aria-label={label}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${color}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="[&>svg]:size-4">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export default App
