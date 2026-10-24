import { contextBridge, ipcRenderer } from 'electron';

// Écran de réglages : l'état vient du processus principal (settings.ts), qui
// capte aussi les touches. Le rendu ne renvoie que les clics, la molette et la
// saisie de texte.
contextBridge.exposeInMainWorld('cyberSettings', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('settings:state', (_event, state) => callback(state));
  },
  ready: () => ipcRenderer.send('settings:ready'),
  act: (action: unknown) => ipcRenderer.send('settings:act', action),
});
