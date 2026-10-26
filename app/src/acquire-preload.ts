import { contextBridge, ipcRenderer } from 'electron';

// Langue de l'interface et son catalogue (language.ts), lus par renderer/i18n.js ; en français
// quand le processus principal ne les fournit pas (démonstrations qui chargent la page seule).
// Sans réponse, sendSync rend {} : renderer/i18n.js prend alors le français.
contextBridge.exposeInMainWorld('cyberI18n', ipcRenderer.sendSync('i18n') ?? {});

// Bandeau de la fenêtre « Récupérer » (acquire-window.ts) : il affiche ce qu'il faut
// télécharger et les téléchargements en cours, et renvoie ses quatre boutons et Annuler ;
// en recherche libre, le texte cherché et son moteur, « Télécharger cette vidéo », et quand
// son champ de recherche a le clavier (les touches n'y sont pas des boutons de la borne).
// La page du site, en dessous, n'a pas de préchargement : elle ne voit rien de Cyber Pinball.
contextBridge.exposeInMainWorld('cyberAcquire', {
  onState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('acquire:state', (_event, state) => callback(state));
  },
  ready: () => ipcRenderer.send('acquire:ready'),
  act: (action: 'back' | 'home' | 'browser' | 'close') => ipcRenderer.send('acquire:act', action),
  cancel: (id: number) => ipcRenderer.send('acquire:cancel', id),
  search: (query: string, engine: string) => ipcRenderer.send('acquire:search', query, engine),
  video: () => ipcRenderer.send('acquire:video'),
  grab: (want: 'audio' | 'video') => ipcRenderer.send('acquire:grab', want),
  typing: (typing: boolean) => ipcRenderer.send('acquire:typing', typing),

});
