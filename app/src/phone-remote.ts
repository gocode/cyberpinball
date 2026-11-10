// Le téléphone comme télécommande de la borne (packages/core/src/remote.ts pour l'appairage, le
// chiffrement et la lecture des messages). La borne sert sur le réseau local la page du téléphone
// (app/renderer/telephone/*) et sa liaison WebSocket tant qu'un QR code est affiché ou qu'un
// téléphone est là. Trois endroits montrent le QR (RemoteSurface) : le bandeau du navigateur intégré
// « Récupérer », l'écran Menu système > Borne > Télécommande du téléphone, et le clavier à l'écran ;
// puis le téléphone à accepter, puis celui qui pilote.
//
// Ce que pilote le téléphone dépend de ce que la borne montre (RemoteMode) : la page du site quand
// « Récupérer » est ouvert (browser), le menu sinon (menu : ses boutons, son clavier à l'écran,
// l'envoi d'un fichier vers le dossier d'import), rien pendant une partie (game). La liaison vit tant
// que Cyber Pinball tourne ; elle se coupe quand le téléphone se déconnecte, qu'on le déconnecte à la
// borne, après REMOTE_IDLE_MS sans geste au menu, ou à la fermeture (close).
//
// Au navigateur :
// le téléphone pilote la fenêtre entière : la page du site (la vue sous le bandeau) et le bandeau
// lui-même (moteurs de recherche, champ de recherche, boutons : essai réel du 06/11/2026, on ne
// pouvait pas passer de Web à Images). Ses gestes y sont injectés comme ceux d'une souris et d'un
// clavier (sendInputEvent ; le texte en caractères, jamais insertText : page-input.ts), là où est
// le pointeur. Le pointeur est dessiné dans une fenêtre transparente posée sur toute la fenêtre,
// que les clics traversent (remote-pointer.ts) :
// il y glisse en douceur d'une position à la suivante, même quand le Wi-Fi livre les gestes par
// paquets. Le pointeur de Windows, lui, ne bouge pas. Un téléphone accepté n'accepte personne :
// tant qu'il pilote, un autre téléphone est refusé d'office (« un autre téléphone pilote »), le
// bandeau n'a alors ni Accepter ni Refuser. Jamais une touche qui fermerait la fenêtre (Échap). Le
// texte d'un champ est repris au téléphone pour y être modifié, jamais celui d'un mot de passe ni
// d'un champ secret (REMOTE_FOCUS_PROBE). C'est l'utilisateur qui tape.
//
// Au menu : les boutons passent par le chemin des touches de la borne (frontend.ts, remoteButton),
// portes du mode invité comprises ; le texte remplace celui du clavier à l'écran ; un fichier arrive
// en morceaux scellés (POST /envoi), écrit à part (.envoi-*.part) puis renommé dans le dossier
// d'import, jamais ailleurs, 2 Go au plus, place vérifiée.
//
// Réseau : en usage normal, l'écoute porte sur toutes les cartes, mais ne
// répond qu'aux adresses du réseau local (isLocalNetworkAddress), et seulement si la règle du
// pare-feu de Windows de Cyber Pinball est posée : elle vise CyberPinball.exe pour tous les ports
// (firewall.ts), le serveur, dans le même processus, en profite sans règle de plus ni invite. Sans
// elle, rien n'écoute (Windows afficherait son invite, que personne ne peut valider à la borne, et
// poserait des règles bloquantes qui couperaient aussi le réseau des amis) : le bloc reste visible,
// grisé avec la raison. Pendant un essai (réseau simulé ou coupé) :
// 127.0.0.1 seulement. Sans QR affiché ni téléphone, tout s'arrête : écoute, liaison, clés.
//
// Téléphone gardé (10/11/2026) : accepté une fois, il revient sans QR ni acceptation (remote-kept.ts).
// Tant que la borne en garde un, elle écoute en continu, au menu comme en partie, sur REMOTE_PORT
// (fixe : le téléphone range sa clé par adresse et port), mais ne répond qu'à ses clés : un téléphone
// inconnu lit toujours le QR et attend d'être accepté. Le dernier venu prend la main ; l'autre
// l'apprend (« Un autre téléphone a pris la main ») et ne se reconnecte pas tout seul.

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { BrowserWindow, WebContents, WebContentsView } from 'electron';
import {
  acceptWebSocket,
  cleanUploadName,
  createRemotePairing,
  formatSize,
  freeUploadName,
  openRemoteBytes,
  REMOTE_CHUNK,
  REMOTE_IDLE_MS,
  REMOTE_UPLOAD_IDLE_MS,
  REMOTE_UPLOAD_MAX,
  REMOTE_UPLOAD_SPARE,
  renameWithRetryAsync,
  uploadAad,
  isLocalNetworkAddress,
  language,
  localeOf,
  messagesOf,
  movePointer,
  openRemote,
  parsePhoneMessage,
  pickLanAddress,
  readRemoteField,
  REMOTE_CHALLENGE_BYTES,
  REMOTE_FOCUS_PROBE,
  REMOTE_MAX_FRAME,
  REMOTE_PORT,
  remoteUrl,
  sealRemote,
  smoothSpeed,
  socialNetMode,
  t,
  toBase64Url,
  fromBase64Url,
  wheelFor,
  type FirewallState,
  type KeptPhone,
  type KeptPhones,
  type PhoneMessage,
  type RemoteField,
  type RemoteButton,
  type RemoteNav,
  type RemotePairing,
  type WebSocketLink,
} from '@cyberpinball/core';
import { settleWithin, typeChars } from './page-input';
import { pointerWindow } from './remote-pointer';
import { qrRows } from './remote-qr';
import { journalIncident } from './uncaught';

/** Où écouter : le réseau local réel, 127.0.0.1 seulement (essais), ou nulle part (réseau coupé). */
export type PhoneRemoteMode = 'lan' | 'loopback' | 'off';

/**
 * Le mode d'après celui du réseau des bornes (socialNetMode) : réseau réel en usage normal ;
 * 127.0.0.1 pendant un essai (réseau simulé, ou essai sans opérateur) ; rien quand le réseau a
 * été coupé exprès (CYBERPINBALL_RESEAU=non).
 */
export function phoneRemoteMode(env: NodeJS.ProcessEnv): PhoneRemoteMode {
  const asked = env.CYBERPINBALL_RESEAU?.toLowerCase();
  if (asked === 'non' || asked === 'off') return 'off';
  return socialNetMode(env) === 'public' ? 'lan' : 'loopback';
}

/** Écoute : toutes les cartes sur le réseau local réel, la machine seule pendant un essai. */
export function remoteListenHost(mode: 'lan' | 'loopback'): string {
  return mode === 'lan' ? '0.0.0.0' : '127.0.0.1';
}

/** Le bloc du bandeau : ce que acquire.js affiche (showRemote). */
export type RemoteBar =
  | { phase: 'offer'; qr: string[]; url: string; title: string; line: string }
  | { phase: 'pending'; code: string; title: string; line: string }
  | { phase: 'paired'; title: string; line: string }
  | { phase: 'off'; title: string; line: string };

/** Ce que pilote le téléphone : la page du navigateur intégré, le menu, ou rien (une partie). */
export type RemoteMode = 'browser' | 'menu' | 'game';

/** Où le QR code est affiché : bandeau de « Récupérer », écran de la télécommande, clavier à l'écran. */
export type RemoteSurface = 'browser' | 'menu' | 'keyboard';

/** Le clavier à l'écran du menu, tel que le téléphone le remplit (son texte n'est pas secret : un nom, une recherche). */
export interface MenuField {
  /** Change à chaque ouverture du clavier : le téléphone repart alors du texte de la borne. */
  id: number;
  kind: 'text' | 'number';
  label: string;
  value: string;
}

/** Ce que le menu donne à la télécommande (frontend.ts) : ce qu'il montre, ses boutons, son clavier, le dossier d'import. */
export interface MenuTarget {
  /** Le menu, ou une partie (VPX a les boutons). */
  phase(): 'menu' | 'game';
  /** L'écran affiché et ce qui y est choisi, montrés en tête de la page du téléphone ; `zone` : ce que fait MagnaSave ici. */
  screen(): { title: string; item?: string; zone?: string };
  field(): MenuField | undefined;
  /** Un bouton de la borne appuyé (`repeat` : tenu) ou relâché. */
  button(b: RemoteButton, down: boolean, repeat: boolean): void;
  setText(value: string): void;
  /** Entrée : le clavier à l'écran valide. */
  enter(): void;
  /** Le dossier où ranger un fichier envoyé, ou pourquoi c'est refusé (mode invité, pas de dossier). */
  uploadDir(): { dir: string } | { refused: string };
  /** Envoi en cours (pour le bandeau du menu), undefined quand il est fini ou abandonné. */
  uploading(p: { name: string; received: number; size: number } | undefined): void;
  /** Fichier rangé dans le dossier d'import sous ce nom. */
  uploaded(name: string): void;
  /** Le bloc de la télécommande a changé (QR renouvelé, téléphone à accepter) : redessiner le menu. */
  changed(): void;
}

/** Ce que la fenêtre « Récupérer » donne à la télécommande pendant qu'elle est ouverte. */
export interface RemoteTarget {
  win: BrowserWindow;
  /** La vue de la page du site, sous le bandeau. */
  view: WebContentsView;
  /** Le bloc du bandeau a changé : le redessiner. */
  changed(): void;
  /** Retour, Avancer, Retour à la fiche, Fermer, Recharger. */
  nav(action: RemoteNav): void;
  /** Actions de la feuille « Plus » du téléphone (Retour à la fiche, Télécharger cette vidéo…). */
  actions(): { id: string; label: string }[];
  act(id: string): void;
  /** Recherche libre : le texte et le moteur de la page de résultats affichée, et les moteurs proposés. */
  search?(): { query: string; engine: string; engines: { id: string; label: string }[] } | undefined;
  /** Recherche libre : `engine` absent ou inconnu, celui de la page affichée. */
  runSearch?(query: string, engine?: string): void;
}

/**
 * La fenêtre d'un autre programme que le téléphone pilote par Windows : Microsoft Edge pendant la
 * connexion au compte YouTube (edge-login.ts). Le pavé tactile y déplace la vraie souris, sans
 * sortir de la fenêtre ; le clavier y tape comme un clavier. Aucune page n'est lue.
 */
export interface ExternalTarget {
  /** Titre et site montrés en tête du téléphone. */
  page(): { title: string; host: string };
  /** Rectangle de la fenêtre, pixels physiques du bureau : le pointeur n'en sort pas. */
  rect(): { x: number; y: number; width: number; height: number } | undefined;
  pointer(x: number, y: number): void;
  click(button: 'left' | 'right', count: number): void;
  /** Au sens de sendInputEvent d'Electron (wheelFor). */
  scroll(deltaX: number, deltaY: number): void;
  /** `del` retours arrière, puis `ins`. */
  text(del: number, ins: string): void;
  /** Tout le champ remplacé (Ctrl+A puis le texte). */
  set(value: string): void;
  key(key: 'Enter' | 'Tab' | 'Backspace' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Space', shift: boolean): void;
  nav(action: RemoteNav): void;
  actions(): { id: string; label: string }[];
  act(id: string): void;
}

export interface PhoneRemoteOptions {
  mode(): PhoneRemoteMode;
  /** État de la règle du pare-feu de Cyber Pinball (relu s'il n'est pas encore connu). */
  firewall?(): Promise<FirewallState | undefined>;
  /** Cyber Pinball tourne-t-il depuis ses sources (electron.exe) : la règle vise CyberPinball.exe. */
  fromSources?: boolean;
  log?(line: string): void;
  /** Cartes réseau (essais) ; par défaut, celles de la machine. */
  interfaces?(): ReturnType<typeof os.networkInterfaces>;
  /** Dossier des pages (app/renderer). */
  rendererDir?: string;
  /** Inactivité au menu avant la coupure (essais) ; par défaut REMOTE_IDLE_MS. */
  idleMs?: number;
  /** Téléphones gardés par la borne (createKeptPhones) ; sans eux, chaque téléphone lit le QR. */
  kept?: KeptPhones;
  /** Port d'écoute ; par défaut REMOTE_PORT sur le réseau local, un port libre pendant un essai. */
  port?: number;
}

/**
 * Fichiers servis au téléphone, et rien d'autre : ses pages (app/renderer/telephone, à part des
 * écrans de la borne), le thème, la langue, les icônes et la police de la borne.
 */
const FILES: Record<string, string> = {
  '/': 'telephone/telephone.html',
  '/telephone.css': 'telephone/telephone.css',
  '/telephone.js': 'telephone/telephone.js',
  '/telephone-core.js': 'telephone/telephone-core.js',
  '/theme.css': 'theme.css',
  '/i18n.js': 'i18n.js',
  '/icons.js': 'icons.js',
  '/polices/saira/Saira-wdth-wght.ttf': 'polices/saira/Saira-wdth-wght.ttf',
  // Icône du raccourci sur l'écran d'accueil (iPhone, Android).
  '/icone.png': '../ressources/icone.png',
};
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.png': 'image/png' };
/** Au plus, connexions ouvertes en même temps (un téléphone, sa reconnexion, un curieux). */
const MAX_LINKS = 4;
/** Un geste injecté dans la page rend la main au plus tard après ce délai (page tombée, qui ne répond plus). */
const INJECT_MAX_MS = 3000;
/** Lecture du champ d'un cadre : au plus ce délai. */
const PROBE_MAX_MS = 2000;
/** Relevé du champ qui a le clavier dans la page, tant qu'un téléphone pilote. */
const FIELD_POLL_MS = 700;
/** Un clic droit du téléphone : le menu de la page qui suit dans ce délai lui revient. */
const MENU_MS = 1500;
/** Où vont les gestes : la page du site, ou le bandeau au-dessus d'elle. */
type Zone = 'page' | 'bar';
/** Flipper tenu au téléphone : après ce délai, l'appui se répète (le menu accélère comme sous un vrai bouton). */
const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 70;
/** Un bouton qui reste tenu plus longtemps est relâché (doigt perdu, téléphone en veille). */
const HOLD_MAX_MS = 20_000;


/** Les adresses de cette machine : le téléphone l'a jointe par l'une d'elles (en-tête Host). */
function ownAddresses(interfaces: ReturnType<typeof os.networkInterfaces>): Set<string> {
  const out = new Set(['127.0.0.1', 'localhost', '::1']);
  for (const list of Object.values(interfaces)) for (const i of list ?? []) out.add(i.address.toLowerCase());
  return out;
}

/** Une liaison ouverte avec le téléphone, après son premier message. */
interface Link {
  ws: WebSocketLink;
  key: Buffer;
  /** Défi de la borne (données associées des messages du téléphone), défi du téléphone (des nôtres). */
  inbound: Buffer;
  outbound: Buffer;
  seqIn: number;
  seqOut: number;
}

/** Un fichier qui arrive du téléphone : écrit dans `part` (caché), renommé à la fin dans le dossier d'import. */
interface Upload {
  id: string;
  link: Link;
  dir: string;
  name: string;
  part: string;
  file: fs.promises.FileHandle;
  size: number;
  received: number;
  index: number;
  last: number;
  busy: boolean;
}

export function createPhoneRemote(opts: PhoneRemoteOptions) {
  const log = opts.log ?? ((line: string) => console.log(line));
  const rendererDir = opts.rendererDir ?? path.join(__dirname, '..', 'renderer');
  const interfaces = opts.interfaces ?? os.networkInterfaces;

  let target: RemoteTarget | undefined;
  /** Fenêtre d'un autre programme (Edge), pilotée par Windows ; passe après « Récupérer ». */
  let external: ExternalTarget | undefined;
  let menu: MenuTarget | undefined;
  /** Endroits qui montrent le QR code maintenant. */
  const surfaces = new Set<RemoteSurface>();
  let pairing: RemotePairing | undefined;
  let server: http.Server | undefined;
  let address: { host: string; port: number } | undefined;
  let unavailable: string | undefined;
  /** La liaison du téléphone accepté (ou qui attend), une seule. */
  let active: Link | undefined;
  const sockets = new Set<import('node:stream').Duplex>();
  const links = new Set<WebSocketLink>();
  let ticker: NodeJS.Timeout | undefined;
  let lastBar = '';
  let lastPhase: string | undefined;
  let qr: { url: string; rows: string[] } | undefined;
  /** Fenêtre transparente du pointeur, sur toute la fenêtre « Récupérer ». */
  let pointer: BrowserWindow | undefined;
  let pointerShown = false;
  /** Pointeur, en pixels du contenu de la fenêtre (bandeau compris). */
  let at = { x: 0, y: 0 };
  /** Vitesse lissée des derniers gestes (smoothSpeed), et l'heure du dernier. */
  let speed: number | undefined;
  let lastMoveAt = 0;
  /** Où vont le texte et les touches : là où le téléphone a cliqué en dernier. */
  let typingIn: Zone = 'page';
  /** Sous le pointeur au dernier geste : quitter une zone la fait sortir du survol. */
  let hoverIn: Zone | undefined;
  let field: RemoteField | undefined;
  let fieldSent = 'null';
  /** Un clic, Tab ou Entrée a pu changer de champ : le prochain relevé renvoie le champ et son texte. */
  let fieldFresh = false;
  let pageSent = '';
  let menuUntil = 0;
  /** Actions du menu de la page (clic droit du téléphone), par identifiant. */
  let menuItems = new Map<string, () => void>();
  /** Gestes du téléphone en cours d'injection : un à la fois, dans l'ordre ; oubliés quand le mode change. */
  let queue: Promise<void> = Promise.resolve();
  let generation = 0;
  /** Ouverture de l'écoute : une écoute lancée pour une ouverture précédente se referme. */
  let wakeRun = 0;
  /** Dernier mode, écran et champ envoyés au téléphone. */
  let modeSent: RemoteMode | undefined;
  let screenSent = '';
  /** Dernier geste du téléphone (hors ping) : au menu, sans geste pendant REMOTE_IDLE_MS, la liaison se coupe. */
  let lastActivity = Date.now();
  /** Boutons de la borne tenus au téléphone : la répétition, et l'arrêt de sûreté. */
  const holds = new Map<RemoteButton, { timer: NodeJS.Timeout; until: number }>();
  /** Envoi d'un fichier en cours, un seul, lié à la connexion qui l'a demandé. */
  let upload: Upload | undefined;
  const kept = opts.kept;
  /** Cyber Pinball se ferme : plus rien ne relance l'écoute (un dernier redessin du menu montrerait encore le QR). */
  let closed = false;
  /** Une borne qui garde un téléphone écoute en continu, tant que le menu tourne. */
  const keepListening = () => Boolean(menu && kept?.size());

  // --- Bandeau ---------------------------------------------------------------

  function bar(): RemoteBar | undefined {
    // Écoute continue pour les téléphones gardés : sans endroit qui montre le QR ni téléphone, pas de bloc (ni de clé de QR).
    if (!surfaces.size && !pairing?.session()) return undefined;
    if (unavailable) return { phase: 'off', title: t('Télécommande'), line: unavailable };
    if (!pairing || !address) return { phase: 'off', title: t('Télécommande'), line: t('Préparation…') };
    const view = pairing.view();
    if (view.phase === 'offer') {
      const url = remoteUrl(address.host, address.port, view.key);
      // La matrice d'un QR ne change qu'avec lui : le bandeau se redessine quatre fois par seconde pendant un téléchargement.
      if (qr?.url !== url) qr = { url, rows: qrRows(url) };
      return { phase: 'offer', qr: qr.rows, url, title: t('Télécommande'), line: t('Scannez avec votre téléphone, sur le même Wi-Fi que la borne') };
    }
    const device = view.device === 'Téléphone' ? t('Téléphone') : view.device; // i18n-ignore : nom par défaut (remote.ts, deviceLabel)
    if (view.phase === 'pending') return { phase: 'pending', code: view.code, title: t('Même code ?'), line: device };
    return { phase: 'paired', title: t('Téléphone connecté'), line: device };
  }

  /** Redessine le bandeau si le bloc a changé (QR renouvelé, délai d'acceptation dépassé). */
  function tick(): void {
    const now = bar();
    const b = JSON.stringify(now ?? null);
    if (b === lastBar) return;
    // Le téléphone attendait, et le délai est passé : refusé.
    if (lastPhase === 'pending' && now?.phase === 'offer' && active) endLink(active, 'refused');
    lastBar = b;
    lastPhase = now?.phase;
    target?.changed();
    menu?.changed();
  }

  /** Ce que pilote le téléphone maintenant. */
  function mode(): RemoteMode {
    if (target || external) return 'browser';
    return menu ? menu.phase() : 'browser';
  }

  // --- Serveur -----------------------------------------------------------------

  function securityHeaders(host: string): Record<string, string> {
    return {
      'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' ws://${host}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store',
    };
  }

  /** Le catalogue de la langue, réduit aux textes de la page du téléphone. */
  function catalogue(): string {
    const lang = language();
    const page = ['telephone.js', 'telephone.html'].map((f) => fs.readFileSync(path.join(rendererDir, 'telephone', f), 'utf8')).join('\n');
    const messages = Object.fromEntries(Object.entries(messagesOf(lang)).filter(([k]) => page.includes(k)));
    return `window.cyberI18n = ${JSON.stringify({ language: lang, locale: localeOf(lang), messages })};\n`;
  }

  /** Requête venue d'ailleurs que du réseau local, ou adressée à un autre nom que la borne (rebond DNS) : refusée. */
  function allowed(req: http.IncomingMessage): boolean {
    if (!isLocalNetworkAddress(req.socket.remoteAddress)) return false;
    const host = String(req.headers.host ?? '').toLowerCase();
    const m = /^\[?([0-9a-f.:]+|localhost)\]?:(\d+)$/.exec(host);
    return Boolean(m && address && Number(m[2]) === address.port && ownAddresses(interfaces()).has(m[1]!));
  }

  function serve(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = (req.url ?? '/').split('?')[0]!;
    if (allowed(req) && req.method === 'POST' && url.startsWith('/envoi/')) return void receiveChunk(req, res, url);
    if (!allowed(req) || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' }).end();
      return;
    }
    const headers = securityHeaders(String(req.headers.host));
    if (url === '/catalogue.js') {
      res.writeHead(200, { ...headers, 'Content-Type': TYPES['.js']! }).end(req.method === 'HEAD' ? undefined : catalogue());
      return;
    }
    const file = FILES[url];
    if (!file) {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }).end();
      return;
    }
    fs.readFile(path.join(rendererDir, file), (error, body) => {
      if (error) return void res.writeHead(500, headers).end();
      res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(req.method === 'HEAD' ? undefined : body);
    });
  }

  function upgrade(req: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): void {
    const origin = String(req.headers.origin ?? '');
    if (!allowed(req) || (req.url ?? '') !== '/liaison' || origin !== `http://${String(req.headers.host).toLowerCase()}` || links.size >= MAX_LINKS) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const ws = acceptWebSocket(req, socket, { maxPayload: REMOTE_MAX_FRAME, head });
    if (!ws) return;
    links.add(ws);
    ws.onClose(() => {
      links.delete(ws);
      if (active?.ws === ws) {
        if (upload?.link === active) void abortUpload(undefined);
        active = undefined;
        showPointer(false);
        releaseButtons();
      }
    });
    const inbound = crypto.randomBytes(REMOTE_CHALLENGE_BYTES);
    ws.send(JSON.stringify({ t: 'challenge', n: toBase64Url(inbound) }));
    let link: Link | undefined;
    ws.onText((frame) => {
      if (!pairing) return ws.close();
      if (!link) {
        link = hello(ws, inbound, frame);
        return;
      }
      const raw = openRemote(link.key, link.inbound, frame);
      const message = parsePhoneMessage(raw);
      if (!message || message.s <= link.seqIn) {
        // Trame d'une autre clé, rejouée, ou demande hors de ce qui est permis : liaison coupée (le téléphone se reconnecte).
        const what = !raw ? 'trame illisible' : !message ? `demande refusée (${String((raw as { t?: unknown }).t).slice(0, 12)})` : 'trame rejouée'; // i18n-ignore : journal
        log(`Télécommande : liaison coupée, ${what}.`); // i18n-ignore : journal
        return ws.close(1008);
      }
      link.seqIn = message.s;
      if (link !== active) return;
      handle(link, message);
    });
  }

  /** Premier message d'une connexion : quelle clé l'ouvre, et la suite. */
  function hello(ws: WebSocketLink, inbound: Buffer, frame: string): Link | undefined {
    const result = pairing!.hello((key) => openRemote(key, inbound, frame));
    const message = result?.message;
    const outbound = message ? fromBase64Url(message.c, REMOTE_CHALLENGE_BYTES) : undefined;
    if (!result) {
      // Aucune clé connue n'ouvre ce message : la page du téléphone le dit (scanner de nouveau).
      log(`Télécommande : liaison refusée depuis ${ws.address}, aucune clé connue n'ouvre son message (${frame.length} car.).`); // i18n-ignore : journal
      ws.send(JSON.stringify({ t: 'unknown' }));
      ws.close(1008);
      return undefined;
    }
    if (message?.t !== 'hello' || message.s !== 1 || !outbound) {
      ws.close(1008);
      return undefined;
    }
    if (result.kind === 'stale') {
      // Clé d'un ancien QR : périmé, déjà servi, ou un autre téléphone pilote. Dit au téléphone, sous cette clé.
      log(`Télécommande : QR code ${result.why === 'expired' ? 'périmé' : result.why === 'used' ? 'déjà servi' : 'refusé, un autre téléphone pilote'} présenté par ${ws.address}.`); // i18n-ignore : journal
      ws.send(sealRemote(result.key, outbound, { t: 'end', why: result.why, s: 1 }));
      ws.close(1008);
      return undefined;
    }
    const link: Link = { ws, key: result.key, inbound, outbound, seqIn: 1, seqOut: 0 };
    // Un téléphone gardé prend la main : celui qui pilotait l'apprend, et ne revient pas tout seul.
    if (active && active.ws !== ws) {
      if (result.kind === 'kept' && result.replaced) endLink(active, 'replaced');
      else active.ws.close();
    }
    active = link;
    if (result.kind === 'kept') {
      log(`Télécommande : téléphone gardé (${result.device}) reconnecté depuis ${ws.address}${result.replaced ? ', il prend la main' : ''}.`); // i18n-ignore : journal
      kept?.seen(result.id);
      ready(link);
    } else if (result.kind === 'claimed') {
      log(`Télécommande : un téléphone (${String(message.device ?? '').slice(0, 40)}) a lu le QR code depuis ${ws.address} ; à accepter à la borne.`); // i18n-ignore : journal
      sendTo(link, { t: 'wait', code: result.code, k: toBase64Url(result.session) });
      link.key = result.session;
    } else if (result.phase === 'pending') sendTo(link, { t: 'wait', code: result.code });
    else ready(link);
    tick();
    return link;
  }

  function sendTo(link: Link, message: Record<string, unknown>): void {
    link.ws.send(sealRemote(link.key, link.outbound, { ...message, s: ++link.seqOut }));
  }

  function endLink(link: Link, why: 'refused' | 'ended' | 'closed' | 'idle' | 'quit' | 'replaced' | 'forgotten'): void {
    if (upload?.link === link) void abortUpload(undefined);
    sendTo(link, { t: 'end', why });
    link.ws.close();
    if (active === link) {
      active = undefined;
      releaseButtons();
    }
    showPointer(false);
  }

  // --- Téléphone accepté ----------------------------------------------------

  function ready(link: Link): void {
    // `kept` : la borne garde ce téléphone, il range sa clé pour revenir sans QR.
    sendTo(link, { t: 'ready', kept: Boolean(pairing?.current()?.kept) });
    lastActivity = Date.now();
    pushState(true);
  }

  /** Mode, puis ce que le mode montre : la page et son champ, ou l'écran du menu et son clavier. */
  function pushState(force = false): void {
    if (!active || pairing?.session() !== 'paired') return;
    const m = mode();
    if (force || m !== modeSent) {
      modeSent = m;
      // Ce qui était en cours d'injection pour l'autre mode est oublié ; un bouton tenu, relâché.
      generation++;
      releaseButtons();
      pageSent = '';
      fieldSent = 'null';
      screenSent = '';
      sendTo(active, { t: 'mode', mode: m });
      force = true;
    }
    showPointer(m === 'browser');
    if (m === 'browser') {
      pushPage(force);
      pushField(force);
      return;
    }
    pushScreen(force);
    pushMenuField(force);
  }

  function pushScreen(force = false): void {
    if (!active || !menu) return;
    const sc = menu.screen();
    const state = { title: sc.title.slice(0, 120), item: (sc.item ?? '').slice(0, 120), zone: (sc.zone ?? '').slice(0, 40) };
    const text = JSON.stringify(state);
    if (!force && text === screenSent) return;
    screenSent = text;
    sendTo(active, { t: 'screen', ...state });
  }

  /** Le clavier à l'écran : il part avec son texte (un nom, une recherche), jamais un mot de passe : le menu n'en demande pas. */
  function pushMenuField(force = false): void {
    if (!active || !menu) return;
    const f = mode() === 'menu' ? menu.field() : undefined;
    const state = f ? { id: f.id, kind: f.kind, label: f.label.slice(0, 60), value: f.value.slice(0, 512) } : null;
    const text = JSON.stringify(state);
    if (!force && text === fieldSent) return;
    fieldSent = text;
    sendTo(active, { t: 'field', field: state });
  }

  function pageState(): Record<string, unknown> | undefined {
    if (!target && external) {
      const p = external.page();
      return { page: { title: p.title.slice(0, 120), host: p.host, canBack: true, canForward: false }, actions: external.actions() };
    }
    if (!target || target.view.webContents.isDestroyed()) return undefined;
    const wc = target.view.webContents;
    let host = '';
    try {
      host = new URL(wc.getURL()).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    const search = target.search?.();
    return {
      page: { title: wc.getTitle().slice(0, 120), host, canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward() },
      actions: target.actions(),
      ...(search ? { search } : {}),
    };
  }

  function pushPage(force = false): void {
    if (!active || pairing?.session() !== 'paired' || (!target && !external)) return;
    const state = pageState();
    const text = JSON.stringify(state ?? null);
    if (!state || (!force && text === pageSent)) return;
    pageSent = text;
    sendTo(active, { t: 'page', ...state });
  }

  /**
   * Le champ qui a le clavier part au téléphone quand il change (autre champ, autre libellé), ou
   * après un clic, Tab ou Entrée, avec son texte, que le téléphone reprend. Pas à chaque relevé :
   * le texte change pendant qu'on tape au téléphone, et le renvoyer effacerait ce qui est en route.
   */
  function pushField(force = false): void {
    if (!active || pairing?.session() !== 'paired' || (!target && !external)) return;
    const key = JSON.stringify(field ? { where: typingIn, kind: field.kind, label: field.label } : null);
    if (!force && !fieldFresh && key === fieldSent) return;
    fieldSent = key;
    fieldFresh = false;
    sendTo(active, { t: 'field', field: field ?? null });
  }

  /** Le champ qui a le clavier, là où le téléphone tape (page ou bandeau), dans le premier cadre qui en a un. */
  async function probeField(fresh = false): Promise<void> {
    if (fresh) fieldFresh = true;
    const contents = typingContents();
    if (!target || !contents || pairing?.session() !== 'paired') return;
    // Le cadre qui a le focus d'abord ; sans focus nulle part (fenêtre en arrière-plan), le champ resté actif.
    let found: RemoteField | undefined;
    // Le cadre principal d'une page tombée ou en train de changer de processus est « disposé » : sa
    // lecture lève. Rejet non traité à chaque battement jusqu'au 10/11/2026 ; ici, pas de champ.
    let frames: Electron.WebFrameMain[];
    try {
      frames = contents.mainFrame.framesInSubtree;
    } catch {
      frames = [];
    }
    for (const frame of frames) {
      let one: RemoteField | undefined;
      try {
        one = readRemoteField(await settleWithin(frame.executeJavaScript(REMOTE_FOCUS_PROBE), PROBE_MAX_MS));
      } catch {
        one = undefined;
      }
      if (one && (one.focused || !found)) found = one;
      if (found?.focused) break;
    }
    field = found && { kind: found.kind, label: found.label, ...(found.value !== undefined ? { value: found.value } : {}) };
    pushField();
    pushPage();
  }

  // --- Injection dans la page -------------------------------------------------

  function wc(): WebContents | undefined {
    const contents = target?.view.webContents;
    return contents && !contents.isDestroyed() ? contents : undefined;
  }

  /** Toute la fenêtre « Récupérer » : le pointeur va du bandeau au bas de la page. */
  function area(): { width: number; height: number } {
    const [width, height] = target && !target.win.isDestroyed() ? target.win.getContentSize() : [1, 1];
    return { width: Math.max(1, width ?? 1), height: Math.max(1, height ?? 1) };
  }

  function zoneContents(zone: Zone): WebContents | undefined {
    const contents = zone === 'bar' ? target?.win.webContents : target?.view.webContents;
    return contents && !contents.isDestroyed() ? contents : undefined;
  }

  /** Là où vont le texte et les touches du téléphone. */
  function typingContents(): WebContents | undefined {
    return zoneContents(typingIn);
  }

  /** Ce qui est sous le pointeur : la page (coordonnées de la page) ou le bandeau (celles de la fenêtre). */
  function under(): { zone: Zone; contents: WebContents; x: number; y: number } | undefined {
    if (!target) return undefined;
    const page = target.view.getBounds();
    const zone: Zone = at.x >= page.x && at.x < page.x + page.width && at.y >= page.y && at.y < page.y + page.height ? 'page' : 'bar';
    const contents = zoneContents(zone);
    if (!contents) return undefined;
    return zone === 'page' ? { zone, contents, x: Math.round(at.x - page.x), y: Math.round(at.y - page.y) } : { zone, contents, x: Math.round(at.x), y: Math.round(at.y) };
  }

  /** La souris sur place, là où est le pointeur ; la zone quittée sort du survol. */
  function hover(): ReturnType<typeof under> {
    const here = under();
    if (!here) return undefined;
    if (hoverIn && hoverIn !== here.zone) zoneContents(hoverIn)?.sendInputEvent({ type: 'mouseLeave', x: -1, y: -1 });
    hoverIn = here.zone;
    here.contents.sendInputEvent({ type: 'mouseMove', x: here.x, y: here.y });
    return here;
  }

  function key(contents: WebContents, keyCode: string, modifiers: ('shift')[] = []): void {
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    // Entrée et Espace ont aussi leur caractère : sans lui, un formulaire ne part pas.
    if (keyCode === 'Return') contents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
    if (keyCode === 'Space') contents.sendInputEvent({ type: 'char', keyCode: ' ', modifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  }

  const KEY_CODES = { Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Space: 'Space' } as const;

  /**
   * Du texte là où est le curseur : un saut de ligne (zone de texte) par la touche Entrée, le reste
   * caractère par caractère (typeChars : accents, émojis), comme un clavier. Jamais insertText : sans
   * élément qui a le focus dans la page (après Tab, ou quand la page déplace le focus, comme celle de
   * Google entre ses étapes), il faisait tomber le rendu de la page (PinCab, 10/11/2026).
   */
  function typeText(contents: WebContents, text: string): void {
    for (const [i, part] of text.split('\n').entries()) {
      if (i) key(contents, 'Return');
      if (part) typeChars(contents, part);
    }
  }

  async function inject(message: PhoneMessage): Promise<void> {
    if (mode() !== 'browser') return injectMenu(message);
    if (!target && external) return injectExternal(external, message);
    if (!target || !wc()) return;
    switch (message.t) {
      case 'move': {
        const now = Date.now();
        speed = smoothSpeed(speed, message, now - lastMoveAt);
        lastMoveAt = now;
        at = movePointer(at, { ...message, speed }, area());
        hover();
        placePointer();
        return;
      }
      case 'click': {
        if (message.button === 'right') menuUntil = Date.now() + MENU_MS;
        const here = hover();
        if (!here) return;
        // Le texte et les touches suivront là où l'on a cliqué : la page, ou le bandeau (son champ de recherche).
        typingIn = here.zone;
        here.contents.focus();
        here.contents.sendInputEvent({ type: 'mouseDown', x: here.x, y: here.y, button: message.button, clickCount: message.count });
        here.contents.sendInputEvent({ type: 'mouseUp', x: here.x, y: here.y, button: message.button, clickCount: message.count });
        flashPointer();
        setTimeout(() => void probeField(true), 180);
        return;
      }
      case 'scroll': {
        const { deltaX, deltaY } = wheelFor(message);
        // Toujours la page (le bandeau ne défile pas), au plus près du pointeur s'il est dans le bandeau.
        const contents = zoneContents('page');
        if (!contents) return;
        const page = target.view.getBounds();
        const x = Math.round(Math.min(Math.max(at.x - page.x, 0), page.width - 1));
        const y = Math.round(Math.min(Math.max(at.y - page.y, 0), page.height - 1));
        // La souris d'abord sur place : après un chargement, Chromium perd une molette qu'aucun mouvement n'a précédée (banc du 06/11/2026).
        contents.sendInputEvent({ type: 'mouseMove', x, y });
        contents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX, deltaY, hasPreciseScrollingDeltas: true, canScroll: true });
        return;
      }
      case 'text': {
        const contents = typingContents();
        if (!contents) return;
        contents.focus();
        for (let i = 0; i < message.del; i++) key(contents, 'Backspace');
        typeText(contents, message.ins);
        return;
      }
      case 'set': {
        // Champ repris au téléphone : tout son texte, remplacé par celui du téléphone, comme un
        // collage (Ctrl+A puis le texte, ou Effacer s'il est vide). Juste où que le curseur soit
        // dans le champ de la borne et où que l'on ait corrigé sur le téléphone.
        const contents = typingContents();
        if (!contents) return;
        contents.focus();
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
        if (message.value) typeText(contents, message.value);
        else key(contents, 'Backspace');
        return;
      }
      case 'key': {
        const contents = typingContents();
        if (!contents) return;
        contents.focus();
        key(contents, KEY_CODES[message.key], message.shift ? ['shift'] : []);
        if (message.key === 'Tab' || message.key === 'Enter') setTimeout(() => void probeField(true), 180);
        return;
      }
      case 'nav':
        target.nav(message.action);
        return;
      case 'act': {
        const fromMenu = menuItems.get(message.id);
        if (fromMenu) {
          menuItems = new Map();
          return fromMenu();
        }
        target.act(message.id);
        return;
      }
      case 'search':
        target.runSearch?.(message.query, message.engine);
        return;
      default:
        return;
    }
  }

  /** Dans la fenêtre d'un autre programme : la vraie souris, sans sortir de la fenêtre, et le clavier de Windows. */
  function injectExternal(ext: ExternalTarget, message: PhoneMessage): void {
    switch (message.t) {
      case 'move': {
        const r = ext.rect();
        if (!r) return;
        const now = Date.now();
        speed = smoothSpeed(speed, message, now - lastMoveAt);
        lastMoveAt = now;
        at = movePointer(at, { ...message, speed }, { width: Math.max(1, r.width), height: Math.max(1, r.height) });
        ext.pointer(r.x + at.x, r.y + at.y);
        return;
      }
      case 'click': {
        const r = ext.rect();
        if (r) ext.pointer(r.x + at.x, r.y + at.y);
        ext.click(message.button === 'right' ? 'right' : 'left', message.count);
        return;
      }
      case 'scroll': {
        const { deltaX, deltaY } = wheelFor(message);
        ext.scroll(deltaX, deltaY);
        return;
      }
      case 'text':
        ext.text(message.del, message.ins);
        return;
      case 'set':
        ext.set(message.value);
        return;
      case 'key':
        ext.key(message.key, Boolean(message.shift));
        return;
      case 'nav':
        ext.nav(message.action);
        return;
      case 'act':
        ext.act(message.id);
        return;
      default:
        return;
    }
  }

  /** Au menu : les boutons, le clavier à l'écran, l'envoi. Les gestes du navigateur arrivés en retard sont ignorés. */
  function injectMenu(message: PhoneMessage): void {
    if (!menu) return;
    switch (message.t) {
      case 'btn':
        if (mode() === 'menu') button(message.b, message.down);
        return;
      case 'set':
        // Le clavier à l'écran n'a qu'une ligne : un saut de ligne (permis pour une zone de texte d'une page) y devient une espace.
        if (mode() === 'menu') menu.setText(message.value.replace(/\n/g, ' '));
        return;
      case 'key':
        if (mode() === 'menu' && message.key === 'Enter') menu.enter();
        return;
      default:
        return;
    }
  }

  function handle(link: Link, message: PhoneMessage): void {
    if (message.t === 'bye') {
      log('Télécommande : le téléphone s’est déconnecté.'); // i18n-ignore : journal
      if (upload?.link === link) void abortUpload(undefined);
      pairing?.end();
      link.ws.close();
      active = undefined;
      showPointer(false);
      releaseButtons();
      tick();
      settle();
      return;
    }
    if (pairing?.session() !== 'paired' || message.t === 'ping') return;
    lastActivity = Date.now();
    // L'envoi ne passe pas par la file des gestes : sa réponse ne doit pas attendre une injection.
    if (message.t === 'up') return void startUpload(link, message);
    if (message.t === 'up-cancel') {
      if (upload?.link === link) {
        log('Télécommande : envoi annulé depuis le téléphone.'); // i18n-ignore : journal
        void abortUpload(undefined);
      }
      return;
    }
    const run = generation;
    // Un geste qui échoue (page fermée ou tombée entre-temps) est noté et oublié ; un geste qui ne
    // répond plus ne bloque pas les suivants (une page tombée ne rend jamais la main).
    queue = queue.then(() => (run === generation ? settleWithin(inject(message), INJECT_MAX_MS) : undefined)).catch((error: unknown) => journalIncident(`Télécommande : geste non transmis à la page (${message.t})`, error)); // i18n-ignore : journal
  }

  // --- Boutons de la borne, tenus au téléphone ----------------------------------

  function button(b: RemoteButton, down: boolean): void {
    if (!menu) return;
    const held = holds.get(b);
    if (!down) {
      if (!held) return;
      clearTimeout(held.timer);
      holds.delete(b);
      menu.button(b, false, false);
      return;
    }
    if (held) return;
    menu.button(b, true, false);
    // Les flippers se répètent quand ils sont tenus ; Start, Exit et MagnaSave non (Start tenu ne relance rien).
    const repeats = b === 'previous' || b === 'next';
    const entry = { timer: undefined as unknown as NodeJS.Timeout, until: Date.now() + HOLD_MAX_MS };
    const again = () => {
      if (holds.get(b) !== entry) return;
      if (Date.now() > entry.until || mode() !== 'menu') return button(b, false);
      if (repeats) menu?.button(b, true, true);
      entry.timer = setTimeout(again, repeats ? HOLD_REPEAT_MS : 1000);
    };
    entry.timer = setTimeout(again, repeats ? HOLD_DELAY_MS : 1000);
    holds.set(b, entry);
  }

  /** Relâche à la borne tout bouton tenu au téléphone (liaison coupée, autre mode). */
  function releaseButtons(): void {
    for (const b of [...holds.keys()]) button(b, false);
  }

  // --- Envoi d'un fichier vers le dossier d'import ------------------------------

  async function startUpload(link: Link, m: Extract<PhoneMessage, { t: 'up' }>): Promise<void> {
    const no = (text: string) => {
      if (active === link) sendTo(link, { t: 'up-no', text });
    };
    if (!menu) return no(t('Envoi indisponible : ouvrez le menu de la borne.'));
    if (upload) return no(t('Un envoi est déjà en cours.'));
    const where = menu.uploadDir();
    if ('refused' in where) return no(where.refused);
    if (m.size < 1) return no(t('Fichier vide : rien à envoyer.'));
    if (m.size > REMOTE_UPLOAD_MAX) return no(t('Fichier trop volumineux. Maximum : {max}.', { max: formatSize(REMOTE_UPLOAD_MAX) }));
    const name = cleanUploadName(m.name);
    if (!name) return no(t('Nom de fichier illisible : renommez-le sur le téléphone.'));
    const dir = path.resolve(where.dir);
    let file: fs.promises.FileHandle;
    const id = toBase64Url(crypto.randomBytes(8));
    const part = path.join(dir, `.envoi-${id}.part`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const disk = fs.statfsSync(dir);
      const free = disk.bavail * disk.bsize;
      if (free < m.size + REMOTE_UPLOAD_SPARE) return no(t('Espace insuffisant sur la borne : {free} libres.', { free: formatSize(Math.max(0, free)) }));
      file = await fs.promises.open(part, 'wx');
    } catch (error) {
      log(`Télécommande : envoi impossible dans ${dir} (${(error as Error).message}).`); // i18n-ignore : journal
      return no(t('Le dossier d’import de la borne est inaccessible.'));
    }
    if (active !== link || upload) {
      await file.close().catch(() => undefined);
      fs.rmSync(part, { force: true });
      return;
    }
    upload = { id, link, dir, name, part, file, size: m.size, received: 0, index: 0, last: Date.now(), busy: false };
    log(`Télécommande : réception d'un fichier du téléphone (${formatSize(m.size)}).`); // i18n-ignore : journal
    sendTo(link, { t: 'up-ready', id, chunk: REMOTE_CHUNK });
    menu.uploading({ name, received: 0, size: m.size });
  }

  /** Abandon : le fichier partiel est effacé ; `text` part au téléphone s'il est encore là. */
  async function abortUpload(text: string | undefined): Promise<void> {
    const u = upload;
    if (!u) return;
    upload = undefined;
    menu?.uploading(undefined);
    if (text && active === u.link) sendTo(u.link, { t: 'up-no', text });
    await u.file.close().catch(() => undefined);
    fs.rmSync(u.part, { force: true });
  }

  function reply(res: http.ServerResponse, status: number): void {
    res.writeHead(status, { ...securityHeaders(String(res.req.headers.host)), 'Content-Type': 'text/plain; charset=utf-8', ...(status >= 400 ? { Connection: 'close' } : {}) }).end();
  }

  /**
   * Un morceau d'envoi : POST /envoi/<envoi>/<rang>, scellé sous la clé de la liaison, données
   * associées liées à la connexion et au rang (uploadAad). Les morceaux arrivent dans l'ordre,
   * chacun de la taille attendue ; le dernier reçu, le fichier est renommé dans le dossier d'import.
   */
  async function receiveChunk(req: http.IncomingMessage, res: http.ServerResponse, url: string): Promise<void> {
    const m = /^\/envoi\/([A-Za-z0-9_-]{11})\/(\d{1,7})$/.exec(url);
    const origin = req.headers.origin;
    const u = upload;
    const index = m ? Number(m[2]) : -1;
    const length = Number(req.headers['content-length']);
    if (!m || (origin !== undefined && origin !== `http://${String(req.headers.host).toLowerCase()}`) || !u || u.id !== m[1] || u.busy || active !== u.link) {
      req.resume();
      return reply(res, 409);
    }
    const expected = Math.min(REMOTE_CHUNK, u.size - u.received);
    if (index !== u.index || !Number.isSafeInteger(length) || length !== expected + 28) {
      req.resume();
      await abortUpload(t('La borne a interrompu l’envoi.'));
      return reply(res, 400);
    }
    u.busy = true;
    const parts: Buffer[] = [];
    let got = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      got += chunk.length;
      if (got > length) over = true;
      else parts.push(chunk);
    });
    await new Promise<void>((resolve) => {
      req.on('end', resolve);
      req.on('error', resolve);
      req.on('close', resolve);
    });
    if (upload !== u) return reply(res, 409);
    u.busy = false;
    const body = Buffer.concat(parts);
    const plain = !over && body.length === length ? openRemoteBytes(u.link.key, uploadAad(u.link.inbound, u.id, index), body) : undefined;
    if (!plain || plain.length !== expected) {
      log('Télécommande : morceau d’envoi refusé (illisible, rejoué ou d’une autre connexion).'); // i18n-ignore : journal
      await abortUpload(t('La borne a interrompu l’envoi.'));
      return reply(res, 403);
    }
    try {
      await u.file.write(plain, 0, plain.length, u.received);
    } catch (error) {
      log(`Télécommande : écriture impossible (${(error as Error).message}).`); // i18n-ignore : journal
      await abortUpload(t('Le dossier d’import de la borne est inaccessible.'));
      return reply(res, 500);
    }
    u.received += plain.length;
    u.index++;
    u.last = Date.now();
    lastActivity = u.last;
    if (u.received < u.size) {
      menu?.uploading({ name: u.name, received: u.received, size: u.size });
      return reply(res, 204);
    }
    await finishUpload(u);
    reply(res, 204);
  }

  /** Tout est reçu : le fichier prend son nom dans le dossier d'import (un autre s'il est pris). */
  async function finishUpload(u: Upload): Promise<void> {
    upload = undefined;
    menu?.uploading(undefined);
    try {
      await u.file.close();
      const name = freeUploadName(u.name, (candidate) => fs.existsSync(path.join(u.dir, candidate)));
      const final = path.join(u.dir, name);
      // Le nom est nettoyé (cleanUploadName) : il reste dans le dossier d'import, sans rien d'un chemin.
      if (path.dirname(path.resolve(final)) !== path.resolve(u.dir)) throw new Error('nom hors du dossier d’import'); // i18n-ignore : journal
      await renameWithRetryAsync(u.part, final);
      log(`Télécommande : fichier reçu du téléphone, rangé dans le dossier d'import (${formatSize(u.size)}).`); // i18n-ignore : journal
      if (active === u.link) sendTo(u.link, { t: 'up-done', name });
      menu?.uploaded(name);
    } catch (error) {
      log(`Télécommande : fichier reçu, mais impossible à ranger (${(error as Error).message}).`); // i18n-ignore : journal
      fs.rmSync(u.part, { force: true });
      if (active === u.link) sendTo(u.link, { t: 'up-no', text: t('Le dossier d’import de la borne est inaccessible.') });
    }
  }

  // --- Pointeur ---------------------------------------------------------------

  /** Fenêtre du pointeur, transparente, sur toute la fenêtre « Récupérer » (remote-pointer.ts). */
  function makePointer(win: BrowserWindow): void {
    pointer = pointerWindow(win, rendererDir, (p) => pointer === p && placePointer(true));
  }

  function pointerSend(message: Record<string, unknown>): void {
    if (pointer && !pointer.isDestroyed()) pointer.webContents.send('pointer', message);
  }

  /** Où est la pointe ; `jump` : sans glisser jusque-là (première liaison, retour après une coupure). */
  function placePointer(jump = false): void {
    pointerSend({ x: at.x, y: at.y, show: pointerShown, jump });
  }

  function showPointer(on: boolean): void {
    // Seulement au navigateur (pushState : showPointer(mode === 'browser')).
    pointerShown = on && Boolean(target);
    // Au milieu de la page à la première liaison ; il reste où on l'a laissé après une coupure.
    if (pointerShown && !at.x && !at.y && target) {
      const page = target.view.getBounds();
      at = { x: page.x + page.width / 2, y: page.y + page.height / 2 };
    }
    placePointer(true);
  }

  function flashPointer(): void {
    pointerSend({ flash: true });
  }

  function closePointer(): void {
    const p = pointer;
    pointer = undefined;
    pointerShown = false;
    // close(), jamais destroy() : voir game-notice.ts (dispose).
    if (p && !p.isDestroyed()) p.close();
  }

  // --- Ouverture et fermeture du navigateur intégré ------------------------------

  async function listen(mode: PhoneRemoteMode): Promise<void> {
    if (mode === 'off') {
      unavailable = t('Indisponible : réseau coupé sur cette borne (CYBERPINBALL_RESEAU)');
      return;
    }
    const host = mode === 'lan' ? pickLanAddress(interfaces()) : '127.0.0.1';
    if (!host) {
      unavailable = t('Indisponible : aucun réseau local (Wi-Fi ou câble)');
      return;
    }
    if (mode === 'lan') {
      const state = await opts.firewall?.();
      if (state !== 'allowed') {
        unavailable = opts.fromSources
          ? t('Indisponible : lancé depuis les sources, que le pare-feu de Windows n’autorise pas')
          : t('Indisponible : pare-feu de Windows à autoriser (« Partage et réseau »)');
        log(`Télécommande : pas d'écoute, la règle du pare-feu de Cyber Pinball est « ${state ?? 'inconnue'} ».`); // i18n-ignore : journal
        return;
      }
    }
    const s = http.createServer(serve);
    s.on('upgrade', (req, socket, head) => upgrade(req, socket, head));
    s.on('connection', (socket) => {
      // Rien d'Internet : une adresse hors du réseau local est coupée avant même de lire sa demande.
      if (!isLocalNetworkAddress(socket.remoteAddress)) return void socket.destroy();
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    s.headersTimeout = 10_000;
    s.requestTimeout = 15_000;
    // Port fixe sur le réseau local (le téléphone gardé y retrouve sa clé) ; pris par un autre
    // programme, un port libre : le QR marche toujours, un téléphone gardé devra le scanner de nouveau.
    const wanted = opts.port ?? (mode === 'lan' ? REMOTE_PORT : 0);
    const bind = (port: number) =>
      new Promise<void>((resolve, reject) => {
        s.once('error', reject);
        s.listen(port, remoteListenHost(mode), () => {
          s.off('error', reject);
          resolve();
        });
      });
    try {
      await bind(wanted);
    } catch (error) {
      if (!wanted || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      log(`Télécommande : port ${wanted} déjà pris, écoute sur un port libre (un téléphone gardé devra scanner le QR).`); // i18n-ignore : journal
      await bind(0);
    }
    const port = (s.address() as { port: number }).port;
    server = s;
    address = { host, port };
    log(`Télécommande : page du téléphone servie sur ${host}:${port} (${mode === 'lan' ? 'réseau local' : 'essai, 127.0.0.1'}).`); // i18n-ignore : journal
  }

  /** Un QR va s'afficher : la télécommande se réveille (appairage neuf, écoute). Rien si elle l'est déjà. */
  function wake(): void {
    if (pairing || closed) return;
    const run = ++wakeRun;
    pairing = createRemotePairing({ kept: () => kept?.keys() ?? [] });
    unavailable = undefined;
    lastBar = '';
    lastPhase = undefined;
    void listen(opts.mode())
      .catch((error: Error) => {
        unavailable = t('Indisponible : {reason}', { reason: error.message });
        log(`Télécommande : écoute impossible (${error.message}).`); // i18n-ignore : journal
      })
      .finally(() => {
        if (run !== wakeRun) return closeServer();
        clearInterval(ticker);
        ticker = setInterval(heartbeat, FIELD_POLL_MS);
        ticker.unref?.();
        tick();
      });
  }

  /** Toutes les 700 ms : QR à renouveler, champ de la page, mode et écran du menu, inactivité, envoi en panne. */
  function heartbeat(): void {
    tick();
    if (target) void probeField();
    // L'écran du menu part à chaque redessin (menuChanged) : ici, seulement un changement de mode.
    if (mode() !== modeSent) pushState();
    const now = Date.now();
    if (mode() !== 'menu') lastActivity = now;
    else if (active && pairing?.session() === 'paired' && now - lastActivity > (opts.idleMs ?? REMOTE_IDLE_MS)) {
      log('Télécommande : téléphone déconnecté après 20 minutes sans geste.'); // i18n-ignore : journal
      endLink(active, 'idle');
      pairing.end();
      tick();
      settle();
      return;
    }
    if (upload && !upload.busy && now - upload.last > REMOTE_UPLOAD_IDLE_MS) {
      log('Télécommande : envoi abandonné, plus rien reçu du téléphone.'); // i18n-ignore : journal
      void abortUpload(t('Envoi interrompu : plus rien reçu du téléphone.'));
    }
  }

  /** Plus de QR affiché ni de téléphone : l'écoute s'arrête, les clés sont oubliées. Un téléphone qui attendait, sans code à comparer, est refusé. */
  function settle(): void {
    if (!pairing) return;
    if (!surfaces.size && pairing.session() === 'pending') {
      log('Télécommande : plus de code affiché, téléphone en attente refusé.'); // i18n-ignore : journal
      if (active) endLink(active, 'refused');
      pairing.end();
    }
    if (surfaces.size || pairing.session() || keepListening()) return;
    sleep();
  }

  function sleep(why: 'closed' | 'quit' = 'closed'): void {
    if (!pairing) return;
    wakeRun++;
    generation++;
    if (active) endLink(active, why);
    active = undefined;
    void abortUpload(undefined);
    releaseButtons();
    clearInterval(ticker);
    ticker = undefined;
    closeServer();
    pairing = undefined;
    unavailable = undefined;
    lastBar = '';
    lastPhase = undefined;
    modeSent = undefined;
    log(why === 'quit' ? 'Télécommande : Cyber Pinball se ferme, écoute arrêtée.' : 'Télécommande : plus de QR code ni de téléphone, écoute arrêtée.'); // i18n-ignore : journal
    target?.changed();
    menu?.changed();
  }

  /** Le navigateur intégré s'ouvre : son bandeau montre le QR, le téléphone connecté passe au pavé tactile. */
  function attach(next: RemoteTarget): void {
    if (target) detach();
    target = next;
    surfaces.add('browser');
    at = { x: 0, y: 0 };
    speed = undefined;
    typingIn = 'page';
    hoverIn = undefined;
    field = undefined;
    makePointer(next.win);
    const contents = next.view.webContents;
    // Une page nouvelle : son titre, Retour et Avancer vont au téléphone.
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-stop-loading'] as const) contents.on(event as 'did-stop-loading', () => pushPage());
    contents.on('did-stop-loading', () => void probeField());
    next.win.on('closed', () => {
      if (target === next) detach();
      closePointer();
    });
    wake();
    pushState();
    tick();
  }

  function closeServer(): void {
    const s = server;
    server = undefined;
    address = undefined;
    for (const ws of links) ws.close();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    s?.close();
  }

  /**
   * Le navigateur intégré se ferme. Avec le menu (setMenu), le téléphone connecté revient à ses
   * boutons ; sans lui (essais du navigateur seul), la liaison est coupée, les clés oubliées.
   */
  function detach(): void {
    if (!target) return;
    target = undefined;
    surfaces.delete('browser');
    menuItems = new Map();
    closePointer();
    typingIn = 'page';
    hoverIn = undefined;
    if (!menu) {
      if (pairing) sleep('closed');
      log('Télécommande : navigateur intégré fermé, liaison coupée.'); // i18n-ignore : journal
      return;
    }
    log('Télécommande : navigateur intégré fermé, le téléphone revient au menu.'); // i18n-ignore : journal
    pushState();
    settle();
    tick();
  }

  /** Un écran du menu montre le QR (écran de la télécommande, clavier à l'écran), ou plus. */
  function show(surface: Exclude<RemoteSurface, 'browser'>, on: boolean): void {
    if (on === surfaces.has(surface)) return;
    if (on) {
      surfaces.add(surface);
      wake();
      tick();
      return;
    }
    surfaces.delete(surface);
    settle();
    tick();
  }

  /** La fenêtre d'un autre programme s'ouvre (Edge) : le téléphone connecté passe au pavé tactile. */
  function attachExternal(next: ExternalTarget): void {
    external = next;
    // Le QR code d'association vit tant qu'Edge est ouvert : l'écran de connexion le montre en grand.
    surfaces.add('browser');
    const r = next.rect();
    at = r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 };
    speed = undefined;
    field = undefined;
    wake();
    pushState();
    tick();
  }

  function detachExternal(next?: ExternalTarget): void {
    if (!external || (next && next !== external)) return;
    external = undefined;
    if (!target) surfaces.delete('browser');
    log('Télécommande : fenêtre externe fermée, le téléphone revient au menu.'); // i18n-ignore : journal
    pushState();
    settle();
    tick();
  }

  return {
    attach,
    detach,
    attachExternal,
    detachExternal,
    show,
    /** Le menu de Cyber Pinball (frontend.ts) : le téléphone le pilote quand « Récupérer » est fermé. */
    setMenu(next: MenuTarget): void {
      menu = next;
      // Un téléphone gardé peut revenir dès le démarrage.
      if (keepListening()) wake();
    },
    /** Le menu a changé (écran, choix, clavier, partie) : le téléphone suit. Appelé à chaque redessin. */
    menuChanged: () => pushState(),
    /** Ce que pilote le téléphone connecté ; undefined sans téléphone accepté. */
    connected: (): RemoteMode | undefined => (active && pairing?.session() === 'paired' ? mode() : undefined),
    /** Cyber Pinball se ferme : le téléphone l'apprend, rien n'écoute plus. */
    close(): void {
      closed = true;
      surfaces.clear();
      sleep('quit');
    },
    bar,
    /** Start à la borne, ou « Accepter » : le téléphone qui attend peut piloter. Faux s'il n'y en avait pas. */
    accept(): boolean {
      if (!pairing?.accept()) return false;
      // Accepté une fois, gardé : il reviendra sans QR (sa clé de session devient la sienne).
      const now = pairing.current();
      if (kept && now) pairing.markKept(kept.add(now.key, now.device));
      log(`Télécommande : téléphone accepté à la borne${kept ? ', gardé' : ''}.`); // i18n-ignore : journal
      if (active) ready(active);
      tick();
      return true;
    },
    /** Un téléphone attend, et ce QR-ci (cet endroit) montre son code : Start l'accepte, Exit le refuse. */
    pendingOn: (surface: RemoteSurface) => pairing?.session() === 'pending' && surfaces.has(surface),
    /** Exit à la borne, ou « Refuser » : le téléphone qui attend est refusé. Faux s'il n'y en avait pas. */
    refuse(): boolean {
      if (pairing?.session() !== 'pending') return false;
      log('Télécommande : téléphone refusé à la borne.'); // i18n-ignore : journal
      if (active) endLink(active, 'refused');
      pairing.end();
      tick();
      settle();
      return true;
    },
    /** « Déconnecter » : le téléphone qui pilote ne pilote plus, un QR neuf s'affiche. */
    end(): void {
      if (pairing?.session() !== 'paired') return;
      log('Télécommande : téléphone déconnecté depuis la borne.'); // i18n-ignore : journal
      if (active) endLink(active, 'ended');
      pairing.end();
      tick();
      settle();
    },
    pending: () => pairing?.session() === 'pending',
    /** Téléphones gardés (le plus récemment vu d'abord), et celui qui pilote. */
    keptPhones(): (KeptPhone & { connected: boolean })[] {
      const now = active && pairing?.session() === 'paired' ? pairing.current()?.kept : undefined;
      return (kept?.list() ?? []).map((p) => ({ ...p, connected: p.id === now }));
    },
    /** « Oublier » : sa clé ne vaut plus rien ; s'il pilotait, il est déconnecté. */
    forget(id: string): void {
      if (!kept?.forget(id)) return;
      log('Télécommande : un téléphone gardé a été oublié à la borne.'); // i18n-ignore : journal
      if (pairing?.current()?.kept === id) {
        if (active) endLink(active, 'forgotten');
        pairing.end();
      }
      tick();
      settle();
      menu?.changed();
    },
    /**
     * Le menu de la page (clic droit) : s'il suit un clic droit du téléphone, ses actions partent
     * au téléphone (vrai), le menu de Windows n'y serait pas atteignable.
     */
    offerMenu(items: { id: string; label: string; run: () => void }[]): boolean {
      if (!active || Date.now() > menuUntil || pairing?.session() !== 'paired' || !target) return false;
      menuUntil = 0;
      menuItems = new Map(items.map((i) => [i.id, i.run]));
      sendTo(active, { t: 'menu', items: items.map(({ id, label }) => ({ id, label })) });
      return true;
    },
    /** La page ou ses actions ont changé (téléchargement, page vidéo) : le téléphone suit. */
    pageChanged: () => pushPage(),
    /** Pour les essais : adresse servie, position du pointeur (contenu de la fenêtre, bandeau compris), sa fenêtre. */
    address: () => address,
    pointerAt: () => ({ ...at }),
    pointerWindow: () => pointer,
    /** Pour les essais : l'envoi en cours. */
    uploadState: () => (upload ? { name: upload.name, received: upload.received, size: upload.size, part: upload.part } : undefined),
  };
}

export type PhoneRemote = ReturnType<typeof createPhoneRemote>;
