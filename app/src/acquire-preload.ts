import { contextBridge, ipcRenderer } from 'electron';

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
