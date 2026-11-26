import { contextBridge, ipcRenderer } from 'electron';

// Root Access (root-access.ts) : la page du jeu reçoit l'état des commandes de la borne (flippers,
// lanceur, MagnaSave, tirette du lanceur analogique), lu par le processus principal. Elle lui renvoie
// seulement où en est la partie (écran, étage, score) : le DMD et le fronton de la borne le montrent.

contextBridge.exposeInMainWorld('borne', {
  on: (callback: (input: unknown) => void) => {
    ipcRenderer.on('root-access:input', (_event, input) => callback(input));
  },
  statut: (status: unknown) => ipcRenderer.send('root-access:status', status),
  // Un événement du jeu (flip, bumper, cible, sortie d'étage, bille perdue…) : il anime les LED de la borne.
  signal: (name: unknown, arg?: unknown) => ipcRenderer.send('root-access:signal', name, arg),
});
