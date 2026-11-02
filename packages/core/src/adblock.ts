// Bloqueur de publicités du navigateur intégré (fenêtre « Récupérer », session
// persist:acquisition ; app/src/ad-blocker.ts) : ce qui ne dépend pas d'Electron. Les listes
// sont celles d'uBlock Origin et d'EasyList, telles que Ghostery les sert pour son moteur
// (@ghostery/adblocker) ; elles sont gardées sur disque et rafraîchies une fois par jour.
//
// Les pages des sites sources (forums des tables : connexion, minuteurs, liens de
// téléchargement que lisent les sondes de sitesessions.ts) ne sont jamais filtrées : un
// bloqueur qui masque un bouton ou coupe un script y casserait la récupération, pour un gain
// nul. Le bloqueur sert la consultation : recherche libre, pages vidéo, YouTube.

import { t } from './i18n';
import { siteOfUrl } from './sitesessions';

/** Au-delà, les listes gardées sur disque sont rafraîchies (en arrière-plan : les anciennes servent en attendant). */
export const AD_LISTS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Les listes gardées, écrites à `savedAt` (ms), sont à rafraîchir ; jamais écrites : oui. */
export function adListsStale(savedAt: number | undefined, now: number): boolean {
  return savedAt === undefined || !(now - savedAt < AD_LISTS_MAX_AGE_MS) || savedAt > now;
}

/**
 * Page jamais filtrée : celle d'un site source (vpuniverse.com, vpforums.org…, sous-domaines
 * compris), ou ce qui n'est pas une page du web (pages de l'application, data:, devtools).
 * Une requête sans page connue (téléchargement repris, service worker) n'est pas filtrée non plus.
 */
export function adBlockExempt(pageUrl: string | undefined): boolean {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return true;
  return siteOfUrl(pageUrl) !== undefined;
}

/** En-tête que Ghostery met à chaque scriptlet (resources.js, assembleScript) : un `var` qui masquerait l'objet commun. */
const SCRIPTLET_GLOBALS_HEADER = "if (typeof scriptletGlobals === 'undefined') { var scriptletGlobals = {}; }";

/**
 * Les scriptlets d'une page en un seul script, pour le monde de la page. Chaque scriptlet
 * de Ghostery embarque ses outils au premier niveau (`class JSONPath`, `function safeSelf`) :
 * exécutés l'un après l'autre dans la page, le deuxième qui redéclare une classe plantait
 * (« Identifier 'JSONPath' has already been declared », YouTube, 02/11/2026), et chacun
 * refaisait son `safeSelf` après les retouches des précédents (boucle sans fin sur
 * Object.apply : tout YouTube restait vide). Ici, chacun a sa fonction, et son `try` (une panne
 * n'arrête pas les suivants) ; `scriptletGlobals` est commun, comme dans uBlock Origin : le
 * premier `safeSelf` garde les fonctions d'origine, avant toute retouche. Rien n'est laissé sur `window`.
 */
export function combineScriptlets(scripts: readonly string[]): string | undefined {
  if (!scripts.length) return undefined;
  const parts = scripts.map((s) => `try { (function () {\n${s.split(SCRIPTLET_GLOBALS_HEADER).join('')}\n})(); } catch (e) { void e; }`);
  return `(function () {\nvar scriptletGlobals = {};\n${parts.join('\n')}\n})();`;
}

/** État du bloqueur, tel que le menu le montre. */
export type AdBlockState = 'off' | 'ready' | 'loading' | 'unavailable';

/** Libellé et détail de la bascule « Bloquer les publicités » (Menu système > Tables > « Ajouter une table » > « Comptes des sites »). */
export function adBlockLabel(state: AdBlockState): { label: string; detail: string } {
  if (state === 'off') return { label: t('Bloquer les publicités : non'), detail: t('Le navigateur intégré montre les pages telles quelles, publicités comprises') };
  const label = t('Bloquer les publicités : oui');
  if (state === 'loading') return { label, detail: t('Listes de filtres en cours de réception : les publicités passent encore') };
  if (state === 'unavailable') return { label, detail: t('Listes de filtres pas encore reçues (hors ligne ?) : les publicités passent jusqu’à la prochaine connexion') };
  return { label, detail: t('Publicités retirées des pages et des vidéos (YouTube compris) ; jamais sur les forums des tables') };
}
