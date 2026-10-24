import { contextBridge, ipcRenderer } from 'electron';

// Langue de l'interface et son catalogue (language.ts), lus par renderer/i18n.js ; en français
// quand le processus principal ne les fournit pas (démonstrations qui chargent la page seule).
contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? { language: 'fr', locale: 'fr-FR', messages: {} });

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
