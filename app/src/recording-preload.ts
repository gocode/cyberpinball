import { contextBridge, ipcRenderer } from 'electron';

// Enregistrement d'une partie (game-recording.ts) : deux pages sans geste du joueur.
// L'enregistreur (renderer/recorder.html, fenêtre jamais montrée) reçoit ses ordres et renvoie la
// vidéo par morceaux ; le témoin (renderer/recording.html, coin du plateau) reçoit son état.

contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? {});

contextBridge.exposeInMainWorld('cyberRecorder', {
  onCommand: (callback: (command: unknown) => void) => {
    ipcRenderer.on('recorder:command', (_event, command) => callback(command));
  },
  ready: () => ipcRenderer.send('recorder:ready'),
  emit: (event: unknown) => ipcRenderer.send('recorder:event', event),
  chunk: (key: string, data: ArrayBuffer) => ipcRenderer.send('recorder:chunk', key, data),
});

contextBridge.exposeInMainWorld('cyberRecording', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('recording:state', (_event, state) => callback(state));
  },
  ready: () => ipcRenderer.send('recording:ready'),
});
