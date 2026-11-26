import { contextBridge, ipcRenderer } from 'electron';

// Root Access (root-access.ts) : la page du jeu reçoit l'état des commandes de la borne (flippers,
// lanceur, MagnaSave, tirette du lanceur analogique), lu par le processus principal. Elle ne renvoie rien.

contextBridge.exposeInMainWorld('borne', {
  on: (callback: (input: unknown) => void) => {
    ipcRenderer.on('root-access:input', (_event, input) => callback(input));
  },
});
