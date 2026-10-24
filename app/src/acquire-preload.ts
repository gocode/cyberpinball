import { contextBridge, ipcRenderer } from 'electron';

// Langue de l'interface et son catalogue (language.ts), lus par renderer/i18n.js ; en français
// quand le processus principal ne les fournit pas (démonstrations qui chargent la page seule).
// Sans réponse, sendSync rend {} : renderer/i18n.js prend alors le français.
contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? {});

// Bandeau de la fenêtre « Récupérer » (acquire-window.ts) : il affiche ce qu'il faut
// télécharger et renvoie ses quatre boutons. La page du site, en dessous, n'a pas de
// préchargement : elle ne voit rien de Cyber Pinball.
contextBridge.exposeInMainWorld('cyberAcquire', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('acquire:state', (_event, state) => callback(state));
  },
  ready: () => ipcRenderer.send('acquire:ready'),
  act: (action: 'back' | 'home' | 'browser' | 'close') => ipcRenderer.send('acquire:act', action),
});
