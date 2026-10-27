import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Langue de l'interface et son catalogue (language.ts), lus par renderer/i18n.js ; en français
// quand le processus principal ne les fournit pas (démonstrations qui chargent la page seule).
// Sans réponse, sendSync rend {} : renderer/i18n.js prend alors le français.
contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? {});

// Touche traitée par le processus principal (key-input.ts) : la page ne s'en sert pas
// (défilement, focus, bouton activé). Elle n'est pas annulée là-bas, pour que son
// relâchement y arrive : Chromium l'aurait sinon jeté.
window.addEventListener(
  'keydown',
  (event) => {
    if (ipcRenderer.sendSync('key-handled', event.code)) event.preventDefault();
  },
  true,
);

// Chaque fenêtre d'écran reçoit son propre état ; les touches sont captées côté
// processus principal (before-input-event). Le rendu n'envoie que les clics de
// souris et les fichiers glissés sur la fenêtre.
contextBridge.exposeInMainWorld('cyber', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('state', (_event, state) => callback(state));
  },
  ready: () => ipcRenderer.send('ready'),
  // DMD du menu vivant (live-dmd.ts) : chaque image changée de l'afficheur, ou le média de la table.
  onDmd: (callback: (shot: unknown) => void) => {
    ipcRenderer.on('dmd', (_event, shot) => callback(shot));
  },
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
  // Menu : sons de l'interface (clic de solénoïde, pièce, knocker), joués par renderer/ui-sounds.js.
  onUiSound: (callback: (cue: unknown) => void) => {
    ipcRenderer.on('ui-sound', (_event, cue) => callback(cue));
  },
});
