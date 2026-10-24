import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Langue de l'interface et son catalogue (language.ts), lus par renderer/i18n.js ; en français
// quand le processus principal ne les fournit pas (démonstrations qui chargent la page seule).
contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? { language: 'fr', locale: 'fr-FR', messages: {} });

// Chaque fenêtre d'écran reçoit son propre état ; les touches sont captées côté
// processus principal (before-input-event). Le rendu n'envoie que les clics de
// souris et les fichiers glissés sur la fenêtre.
contextBridge.exposeInMainWorld('cyber', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('state', (_event, state) => callback(state));
  },
  ready: () => ipcRenderer.send('ready'),
  // Souris : clics et fichiers glissés sur la fenêtre (gestion des tables).
  act: (action: unknown) => ipcRenderer.send('action', action),
  pathOf: (file: File) => webUtils.getPathForFile(file),
  // Médias des jeux : erreur de lecture d'une image ou d'une vidéo (journal du médecin).
  mediaError: (error: unknown) => ipcRenderer.send('media-error', error),
  // Assistant : sons de test joués par cette fenêtre sur la sortie audio demandée,
  // et compte rendu (sortie trouvée ou non, canaux disponibles).
  onSound: (callback: (command: unknown) => void) => {
    ipcRenderer.on('sound', (_event, command) => callback(command));
  },
  soundStatus: (status: unknown) => ipcRenderer.send('sound-status', status),
});
