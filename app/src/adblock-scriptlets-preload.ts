import { ipcRenderer, webFrame } from 'electron';

// Scriptlets du bloqueur de publicités (ad-blocker.ts), dans chaque page du navigateur intégré :
// demandés de façon synchrone et exécutés dans le monde de la page avant ses propres scripts,
// comme uBlock Origin au début du document. YouTube lit ses publicités (ytInitialPlayerResponse)
// dans le premier script de la page : un scriptlet qui arrive après, par un aller-retour
// asynchrone, ne les retire plus. Réglage coupé, page exemptée ou listes absentes : liste vide.
const scripts: unknown = ipcRenderer.sendSync('cyberpinball/adblock/scriptlets', window.location.href);
if (Array.isArray(scripts)) for (const script of scripts) if (typeof script === 'string') void webFrame.executeJavaScript(script).catch(() => undefined);
