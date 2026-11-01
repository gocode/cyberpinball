import { contextBridge, ipcRenderer } from 'electron';

// Réglages en partie (in-game-menu.ts) : une page par écran de la borne, par-dessus VPX. Elle reçoit
// ce qu'elle montre (le cadre du DMD sur son écran ; le panneau, sur l'écran du plateau), textes déjà
// traduits, et ne renvoie que les gestes de la souris ; les touches et les boutons sont lus par le
// processus principal.

contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? {});

contextBridge.exposeInMainWorld('cyberInGame', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('in-game:state', (_event, state) => callback(state));
  },
  act: (action: unknown) => ipcRenderer.send('in-game:act', action),
});
