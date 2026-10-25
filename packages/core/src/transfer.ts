// Progression d'un téléchargement, dite partout de la même façon : bandeau de la fenêtre
// « Récupérer », notice du menu et de la liste d'attente, propositions de médias.
// « 48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min » ; taille inconnue : « 48,2 Mo · 3,1 Mo/s ».
//
// La taille vient de l'en-tête de la réponse ; beaucoup de sites ne l'envoient pas (fichier
// servi compressé, ou par morceaux). Elle est alors lue sur la page du site, là où il
// l'affiche (« Size 212.6 MB », « File Size: 40.81 MB ») : une taille approchée, dite
// « environ », qui donne quand même un pourcentage et une barre qui avance.
//
// Le débit est lissé (moyenne simple les trois premières secondes, puis moyenne
// exponentielle) : un paquet en retard ou une rafale ne font pas sauter le temps restant
// d'une minute à une heure. Il n'est dit qu'après une seconde de mesure ; avant, il ne
// voudrait rien dire.

import { formatSize } from './fileops';
import { formatNumber, t } from './i18n';

/** Où en est un téléchargement : octets reçus, total s'il est connu, débit et temps restant s'ils sont mesurés. */
export interface TransferProgress {
  received: number;
  /** Absent quand ni le site ni sa page ne donnent la taille. */
  total?: number;
  /** Taille lue sur la page du site, arrondie par lui : « environ », jamais 100 % avant la fin. */
  approx?: boolean;
  /** Octets par seconde, lissé. */
  rate?: number;
  /** Secondes restantes, au débit lissé (taille connue seulement). */
  remaining?: number;
}

/** Constante de temps du lissage du débit, en millisecondes. */
const SMOOTHING_MS = 3000;
/** Mesure nécessaire avant de dire un débit. */
const FIRST_RATE_MS = 1000;

/**
 * Compteur d'un téléchargement : à chaque relevé (octets reçus à l'instant `at`), rend
 * la progression avec le débit lissé et le temps restant. Un relevé sans octet nouveau
 * fait baisser le débit : un téléchargement qui cale le montre.
 */
export function createTransferMeter(start = Date.now()) {
  let lastAt = start;
  let lastReceived: number | undefined;
  let firstReceived = 0;
  let rate: number | undefined;
  let measured = 0;
  return {
    update(received: number, total?: number, at = Date.now(), approx = false): TransferProgress {
      if (lastReceived === undefined || received < lastReceived) {
        // Premier relevé (ou reprise depuis zéro) : rien à mesurer encore.
        lastReceived = firstReceived = received;
        lastAt = at;
      } else if (at > lastAt) {
        const dt = at - lastAt;
        measured += dt;
        if (measured <= SMOOTHING_MS) {
          // Les premières secondes : la moyenne depuis le début, que le lissage partant de
          // zéro sous-estimerait longtemps.
          rate = ((received - firstReceived) * 1000) / measured;
        } else {
          const instant = ((received - lastReceived) * 1000) / dt;
          rate = rate! + (1 - Math.exp(-dt / SMOOTHING_MS)) * (instant - rate!);
        }
        lastReceived = received;
        lastAt = at;
      }
      // Une taille approchée dépassée de plus de 3 % était fausse : mieux vaut ne rien promettre.
      const known = total !== undefined && total > 0 && !(approx && received > total * 1.03) ? total : undefined;
      const shown = measured >= FIRST_RATE_MS ? rate : undefined;
      const left = known !== undefined ? Math.max(0, known - received) : undefined;
      return {
        received,
        ...(known !== undefined ? { total: known } : {}),
        ...(known !== undefined && approx ? { approx: true } : {}),
        ...(shown !== undefined ? { rate: shown } : {}),
        ...(left !== undefined && shown !== undefined && shown > 0 ? { remaining: left / shown } : {}),
      };
    },
    /** En pause : la mesure repart de zéro à la reprise, sans compter l'arrêt comme un débit nul. */
    pause(): void {
      lastReceived = undefined;
      firstReceived = 0;
      rate = undefined;
      measured = 0;
    },
  };
}

export type TransferMeter = ReturnType<typeof createTransferMeter>;

/** Pourcentage reçu, entier de 0 à 100 ; undefined quand la taille est inconnue. */
export function transferPercent(p: Pick<TransferProgress, 'received' | 'total' | 'approx'>): number | undefined {
  if (!p.total) return undefined;
  // Taille approchée : 99 % au plus tant que le fichier n'est pas fini.
  return Math.max(0, Math.min(p.approx ? 99 : 100, Math.floor((p.received / p.total) * 100)));
}

/** « 3,1 Mo/s ». */
export function formatRate(bytesPerSecond: number): string {
  return t('{size}/s', { size: formatSize(Math.max(0, Math.round(bytesPerSecond)), true) });
}

/**
 * Temps restant, arrondi pour ne pas trembler : « quelques secondes », « environ 25 s »,
 * « environ 4 min », « environ 1 h 20 min » ; undefined au-delà de quatre jours (ou sans débit).
 */
export function formatRemaining(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 4 * 24 * 3600) return undefined;
  if (seconds < 10) return t('quelques secondes');
  if (seconds < 60) return t('environ {n} s', { n: formatNumber(Math.max(10, Math.round(seconds / 5) * 5)) });
  if (seconds < 3600 - 30) return t('environ {n} min', { n: formatNumber(Math.max(1, Math.round(seconds / 60))) });
  const minutes = Math.round(seconds / 300) * 5;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t('environ {h} h {m} min', { h: formatNumber(h), m: formatNumber(m) }) : t('environ {h} h', { h: formatNumber(h) });
}

/**
 * Volume reçu : « 48,2 Mo sur 312 Mo » ; taille lue sur la page : « 48,2 Mo sur environ 312 Mo » ;
 * taille inconnue : « 48,2 Mo reçus, taille non annoncée ».
 */
export function formatReceived(p: Pick<TransferProgress, 'received' | 'total' | 'approx'>): string {
  const got = formatSize(p.received, true);
  if (!p.total) return t('{got} reçus, taille non annoncée', { got });
  return p.approx ? t('{got} sur environ {total}', { got, total: formatSize(p.total) }) : t('{got} sur {total}', { got, total: formatSize(p.total) });
}

/**
 * Progression en une ligne : « 48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min » ; sans
 * taille connue, « 48,2 Mo reçus, taille non annoncée · 3,1 Mo/s » ; débit et temps restant
 * dits dès qu'ils sont mesurés ; `withPercent` : « 15 % · 48,2 Mo sur 312 Mo · … ».
 */
export function formatTransfer(p: TransferProgress, withPercent = false): string {
  // Le pourcentage en tête là où aucune barre ne le montre déjà (notices, cartes des médias).
  const percent = withPercent ? transferPercent(p) : undefined;
  const parts = [percent !== undefined ? t('{pct} % · {received}', { pct: formatNumber(percent), received: formatReceived(p) }) : formatReceived(p)];
  if (p.rate !== undefined) parts.push(formatRate(p.rate));
  const left = p.remaining !== undefined ? formatRemaining(p.remaining) : undefined;
  if (left) parts.push(left);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Taille affichée sur la page du site

/** Une taille lue sur la page : le texte trouvé (« 212.6 MB ») et ce qui l'entoure (nom du fichier, libellé). */
export interface PageSizeHint {
  size: string;
  context: string;
}

const UNITS: Record<string, number> = { o: 1, b: 1, octets: 1, bytes: 1, ko: 1024, kb: 1024, kib: 1024, mo: 1024 ** 2, mb: 1024 ** 2, mib: 1024 ** 2, go: 1024 ** 3, gb: 1024 ** 3, gib: 1024 ** 3 };

/** « 212.6 MB », « 40,81 Mo », « 1 234 KB » → octets ; undefined si ce n'est pas une taille. */
export function parseShownSize(text: string): number | undefined {
  const m = /(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?)\s*(octets|bytes|kib|mib|gib|ko|kb|mo|mb|go|gb|o|b)\b/i.exec(text);
  if (!m) return undefined;
  const value = Number(m[1]!.replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
  const unit = UNITS[m[2]!.toLowerCase()];
  return Number.isFinite(value) && value > 0 && unit ? Math.round(value * unit) : undefined;
}

/**
 * Taille attendue d'un fichier d'après sa page : celle qui est à côté de son nom (liste des
 * fichiers d'une fiche à plusieurs fichiers), sinon celle d'un libellé « Size », « Taille »,
 * « File Size » quand la page n'en donne qu'une. Plusieurs tailles sans nom : on ne choisit pas.
 */
export function expectedSizeFromPage(hints: PageSizeHint[], filename: string): number | undefined {
  const base = filename.toLowerCase();
  const stem = base.replace(/\.[a-z0-9]{1,5}$/, '');
  const sizes = (list: PageSizeHint[]) => [...new Set(list.map((h) => parseShownSize(h.size)).filter((n): n is number => n !== undefined))];
  const named = sizes(hints.filter((h) => { const c = h.context.toLowerCase(); return c.includes(base) || (stem.length >= 4 && c.includes(stem)); }));
  if (named.length === 1) return named[0];
  // Le libell\u00e9 juste devant la taille (\u00ab Size 48.13 MB \u00bb, \u00ab File Size: 40.81MB \u00bb) : un \u00ab taille \u00bb
  // ailleurs dans la phrase (\u00ab Table (24 Mo, taille connue) \u00bb) ne dit pas de quel fichier il s'agit.
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelled = sizes(hints.filter((h) => new RegExp(`(file\\s*size|filesize|size|taille|gr\u00f6\u00dfe)\\s*:?\\s*${escape(h.size)}`, 'i').test(h.context)));
  return labelled.length === 1 ? labelled[0] : undefined;
}

/**
 * Script de page (executeJavaScript) : chaque taille affichée (« 48.13 MB ») avec le texte
 * de son bloc (libellé, nom du fichier), pour expectedSizeFromPage. Le bloc est le plus
 * petit élément qui porte la taille, élargi de trois niveaux au plus tant qu'il n'en
 * contient pas une autre (une liste de fichiers garde chaque nom avec sa taille). L'unité
 * doit être suivie d'autre chose qu'une minuscule : « 4.2 MBDownload » (blocs collés par
 * textContent) compte, « 12 months » non. Rend []
 * sur une page sans taille ; ne modifie rien.
 */
export const PAGE_SIZE_PROBE = `(() => {
  const SIZE = /\\d+(?:[.,]\\d+)?\\s*(?:octets|bytes|[kKmMgG]i?[bB]|[kKmMgG]o)(?![a-z])/;
  const ALL = new RegExp(SIZE.source, 'g');
  const out = [];
  const els = document.querySelectorAll('body *');
  for (let i = 0; i < els.length && out.length < 40; i++) {
    const el = els[i];
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text.length > 120) continue;
    const m = SIZE.exec(text);
    if (!m) continue;
    if ([...el.children].some((c) => SIZE.test(c.textContent || ''))) continue;
    let block = el;
    for (let k = 0; k < 3 && block.parentElement; k++) {
      const up = block.parentElement.textContent || '';
      if (up.length > 400 || (up.match(ALL) || []).length > 1) break;
      block = block.parentElement;
    }
    out.push({ size: m[0], context: (block.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400) });
  }
  return out;
})()`;
