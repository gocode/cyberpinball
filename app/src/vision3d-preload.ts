import { contextBridge, ipcRenderer } from 'electron';

// Vision 3D (vision3d.ts) : la page de la webcam (renderer/vision3d-webcam.html, fenêtre jamais
// montrée) reçoit MediaPipe et le modèle du visage, et renvoie la position des yeux à chaque image.

contextBridge.exposeInMainWorld('cyberVision3d', {
  assets: () => ipcRenderer.invoke('vision3d:assets') as Promise<{ bundle: string; loader: string; wasm: Uint8Array; model: Uint8Array } | undefined>,
  send: (message: unknown) => ipcRenderer.send('vision3d:webcam', message),
});
