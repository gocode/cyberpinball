import { contextBridge, ipcRenderer } from 'electron';

// Notification pendant la partie (game-notice.ts) : la page (renderer/game-notice.html, coin du
// plateau, par-dessus VPX) reçoit ce qu'elle montre, textes déjà traduits ; aucun geste du joueur.

contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? {});

contextBridge.exposeInMainWorld('cyberNotice', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('notice:state', (_event, state) => callback(state));
  },
});
