import type { BotDropApi } from './shared/bots'

declare global {
  interface Window {
    botdrop: BotDropApi
  }
}

export {}
