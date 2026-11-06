import { contextBridge, ipcRenderer } from 'electron';

// Fenêtre du pointeur du téléphone (remote-pointer.html, phone-remote.ts) : la place de la pointe,
// montrée ou cachée, et l'anneau d'un clic. Rien d'autre ne passe.
contextBridge.exposeInMainWorld('cyberPointer', {
  on: (callback: (message: unknown) => void) => ipcRenderer.on('pointer', (_e, message: unknown) => callback(message)),
});
