import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BotDropApi, BotUpdate, BotView } from '../src/shared/bots.js'

const api: BotDropApi = {
  chooseProject: () => ipcRenderer.invoke('bots:choose-project'),
  deleteBot: (id: string) => ipcRenderer.invoke('bots:delete', id),
  getDroppedPath: (file: File) => {
    const legacyPath = (file as File & { path?: string }).path
    return webUtils?.getPathForFile(file) || legacyPath || ''
  },
  importPaths: (paths: string[]) => ipcRenderer.invoke('bots:import-paths', paths),
  listBots: () => ipcRenderer.invoke('bots:list'),
  onBotsChanged: (listener: (bots: BotView[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, bots: BotView[]) =>
      listener(bots)
    ipcRenderer.on('bots:changed', handler)
    return () => ipcRenderer.removeListener('bots:changed', handler)
  },
  restartBot: (id: string) => ipcRenderer.invoke('bots:restart', id),
  startBot: (id: string) => ipcRenderer.invoke('bots:start', id),
  stopBot: (id: string) => ipcRenderer.invoke('bots:stop', id),
  stopAllBots: () => ipcRenderer.invoke('bots:stop-all'),
  updateBot: (update: BotUpdate) => ipcRenderer.invoke('bots:update', update),
}

contextBridge.exposeInMainWorld('botdrop', api)
