// Le téléphone comme télécommande de la borne. Premier
// jalon : le navigateur intégré « Récupérer » ; deuxième : tout le menu, ses boutons,
// son clavier à l'écran, et l'envoi d'un fichier vers le dossier d'import. Une borne n'a souvent ni clavier ni souris, alors
// que les sites communautaires demandent de s'y connecter et d'y cliquer. Le bandeau du
// navigateur montre un QR code ; le téléphone ouvre la page que sert la borne sur le réseau local
// (aucun serveur externe, aucune application à installer) : un pavé tactile, son clavier, Retour,
// Avancer, Fermer. La borne injecte ces gestes dans la page (app/src/phone-remote.ts) ; c'est
// l'utilisateur qui tape, Cyber Pinball n'écrit rien dans les mots de passe ni dans les cookies.
//
// Ici, ce qui ne dépend pas d'Electron : l'appairage, le chiffrement des messages, les adresses du
// réseau local, le pointeur, et la lecture des messages du téléphone.
//
// Appairage (décidé le 06/11/2026) :
// - le QR porte une clé de 256 bits, dans le fragment de l'adresse (après « # ») : un navigateur ne
//   l'envoie jamais sur le réseau. Elle vaut REMOTE_PAIRING_MS, puis le QR se renouvelle ; elle ne
//   sert qu'une fois : le premier téléphone qui s'en sert la consomme ;
// - ce téléphone attend d'être accepté à la borne (Start, ou le bouton du bandeau), un code de
//   quatre chiffres affiché des deux côtés ; sans réponse en REMOTE_ACCEPT_MS, il est refusé ;
// - accepté, il reçoit une clé de session, qui le laisse revenir après une coupure (page rechargée,
//   écran verrouillé, Wi-Fi perdu un instant) tant que la liaison vit ;
// - un seul téléphone à la fois : le QR disparaît tant qu'un téléphone attend ou pilote ;
// - la liaison vit tant que le menu de Cyber Pinball tourne, partie comprise ; elle se coupe quand
//   le téléphone se déconnecte, qu'on le déconnecte à la borne, après REMOTE_IDLE_MS sans geste au
//   menu, ou quand Cyber Pinball se ferme. Sans téléphone ni QR affiché, rien n'écoute et tout
//   s'efface (createRemotePairing est recréé au prochain QR).
//
// Téléphone gardé (10/11/2026) : accepté une fois, le téléphone garde sa clé de session, et la
// borne aussi (remote-kept.ts). Il revient ensuite sans QR ni acceptation, d'un raccourci sur son
// écran d'accueil ; la borne écoute alors en continu sur REMOTE_PORT, tant qu'elle garde un
// téléphone. « Oublier » à la borne retire sa clé : il doit de nouveau scanner le QR.
//
// Chiffrement : la page du téléphone est servie en HTTP (un certificat de la borne ferait afficher
// au téléphone une alerte de sécurité), où le navigateur n'offre pas WebCrypto. Chaque message est
// donc scellé en ChaCha20-Poly1305 (RFC 8439), par chacha.ts ici (Electron, avec BoringSSL, ne
// l'offre pas à createCipheriv) et par une version JavaScript sur le téléphone
// (app/renderer/telephone/telephone-core.js) ; remote.test.ts compare les deux à node:crypto (OpenSSL).
// Les données associées lient chaque message à sa connexion (le défi de l'autre côté), un numéro
// croissant à son rang : un message rejoué ou venu d'une autre connexion est refusé. Personne sur
// le Wi-Fi ne lit ce que tape l'utilisateur, ni ne pilote la borne sans la clé du QR.

import * as crypto from 'node:crypto';
import { aeadOpen, aeadSeal } from './chacha';
import { RANKING_SCOPES, type RankingScope } from './rankings';
import { SCORE_PERIODS, type ScorePeriod } from './scoreboard';

/** Durée de validité d'un QR code (sa clé d'appairage), puis il se renouvelle. */
export const REMOTE_PAIRING_MS = 3 * 60_000;
/** Délai pour accepter à la borne un téléphone qui vient de lire le QR ; au-delà, il est refusé. */
export const REMOTE_ACCEPT_MS = 60_000;
/** Taille maximale d'un message du téléphone (trame WebSocket), en octets. */
export const REMOTE_MAX_FRAME = 4096;
/** Clés d'appairage et de session, défis de connexion. */
export const REMOTE_KEY_BYTES = 32;
export const REMOTE_CHALLENGE_BYTES = 16;
/** Plus long texte qu'un message de saisie apporte (une phrase, un mot de passe collé). */
export const REMOTE_TEXT_MAX = 512;
/** Au plus, entrées d'un écran envoyées au téléphone (« Toutes les tables » d'une grande bibliothèque comprise). */
export const REMOTE_ENTRIES_MAX = 1500;
/** Au menu, sans geste du téléphone pendant ce délai (hors partie), la liaison se coupe. */
export const REMOTE_IDLE_MS = 20 * 60_000;
/**
 * Port fixe de la page du téléphone sur le réseau local. Le navigateur du téléphone range la clé
 * d'un téléphone gardé par origine (adresse et port) : un port qui changerait à chaque ouverture
 * lui ferait tout oublier, et son raccourci sur l'écran d'accueil ne mènerait plus nulle part.
 */
export const REMOTE_PORT = 47820;
/** Au plus, téléphones gardés par la borne ; au-delà, le plus anciennement vu est oublié. */
export const REMOTE_KEPT_MAX = 8;
/** Plus gros fichier que le téléphone peut envoyer à la borne (une table avec son PuP-Pack). */
export const REMOTE_UPLOAD_MAX = 2 * 1024 ** 3;
/** Morceau d'un envoi, avant scellement : un message HTTP chacun, l'un après l'autre. */
export const REMOTE_CHUNK = 256 * 1024;
/** Place laissée libre sur le disque de la borne après un envoi. */
export const REMOTE_UPLOAD_SPARE = 512 * 1024 ** 2;
/** Sans morceau pendant ce délai, l'envoi est abandonné et ce qui était reçu effacé. */
export const REMOTE_UPLOAD_IDLE_MS = 60_000;

// ---------------------------------------------------------------------------
// Encodage

/** base64url sans remplissage (fragment d'adresse, trames). */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** Lecture stricte de base64url : undefined pour tout autre caractère, ou une longueur impossible. */
export function fromBase64Url(text: unknown, bytes?: number): Buffer | undefined {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
  const out = Buffer.from(text, 'base64url');
  if (bytes !== undefined && out.length !== bytes) return undefined;
  return out;
}

// ---------------------------------------------------------------------------
// Chiffrement des messages

const NONCE = 12;
const TAG = 16;

/**
 * Scelle un message (JSON) pour l'autre côté : base64url(nonce 12 octets ‖ chiffré ‖ étiquette 16).
 * `aad` : le défi de connexion du destinataire. Nonce tiré au hasard (96 bits) : quelques milliers
 * de messages par clé, bien loin d'une collision. ChaCha20-Poly1305 de chacha.ts : celui de
 * node:crypto manque dans Electron (BoringSSL).
 */
export function sealRemote(key: Uint8Array, aad: Uint8Array, message: unknown, random: (n: number) => Buffer = crypto.randomBytes): string {
  const nonce = random(NONCE);
  const body = aeadSeal(key, nonce, aad, Buffer.from(JSON.stringify(message), 'utf8'));
  return toBase64Url(Buffer.concat([nonce, body]));
}

/**
 * Données associées d'un morceau d'envoi : le défi de la borne pour cette connexion, l'envoi et
 * le rang du morceau. Un morceau rejoué, déplacé ou d'un autre envoi ne s'ouvre pas.
 */
export function uploadAad(challenge: Uint8Array, id: string, index: number): Buffer {
  return Buffer.concat([Buffer.from(challenge), Buffer.from(`envoi:${id}:${index}`, 'utf8')]);
}

/** Ouvre un morceau d'envoi (nonce 12 ‖ chiffré ‖ étiquette 16, en binaire) ; undefined s'il ne vient pas de cette clé, pour ces données associées. */
export function openRemoteBytes(key: Uint8Array, aad: Uint8Array, raw: Uint8Array): Uint8Array | undefined {
  if (raw.length < NONCE + TAG || raw.length > REMOTE_CHUNK + NONCE + TAG || key.length !== REMOTE_KEY_BYTES) return undefined;
  return aeadOpen(key, raw.subarray(0, NONCE), aad, raw.subarray(NONCE));
}

/** Scelle un morceau d'envoi (pour les essais : la page du téléphone a sealBytes). */
export function sealRemoteBytes(key: Uint8Array, aad: Uint8Array, plain: Uint8Array, random: (n: number) => Buffer = crypto.randomBytes): Buffer {
  const nonce = random(NONCE);
  return Buffer.concat([nonce, aeadSeal(key, nonce, aad, plain)]);
}

/** Ouvre une trame scellée par sealRemote (ou par le téléphone) ; undefined si elle ne vient pas de cette clé, pour ces données associées. */
export function openRemote(key: Uint8Array, aad: Uint8Array, frame: unknown): unknown {
  const raw = fromBase64Url(frame);
  if (!raw || raw.length < NONCE + TAG || raw.length > REMOTE_MAX_FRAME || key.length !== REMOTE_KEY_BYTES) return undefined;
  const plain = aeadOpen(key, raw.subarray(0, NONCE), aad, raw.subarray(NONCE));
  if (!plain) return undefined;
  try {
    return JSON.parse(Buffer.from(plain).toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Réseau local

/** IPv4 en quatre octets, ou undefined. Les adresses IPv4 vues par un serveur IPv6 (::ffff:a.b.c.d) comprises. */
function ipv4(ip: string): number[] | undefined {
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(ip.trim());
  if (!m) return undefined;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : undefined;
}

/**
 * Une adresse du réseau local : privée (10/8, 172.16/12, 192.168/16), lien local (169.254/16,
 * fe80::/10), IPv6 unique locale (fc00::/7), ou la machine elle-même. Le serveur de la télécommande
 * ne répond qu'à celles-là : jamais à une adresse d'Internet, même si un routeur la laissait passer.
 */
export function isLocalNetworkAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const v4 = ipv4(ip);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const v6 = ip.trim().toLowerCase().replace(/%.*$/, '');
  if (v6 === '::1') return true;
  return /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6);
}

/** Interface réseau, comme os.networkInterfaces() la décrit. */
export interface LanInterface {
  address: string;
  family: string | number;
  internal: boolean;
}

/** Cartes virtuelles (machines virtuelles, WSL, VPN) : leur adresse ne mène pas au téléphone. */
const VIRTUAL = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|vbox|tailscale|zerotier|hamachi|loopback|bluetooth|teredo|isatap|vpn|tap-|tun/i;

/**
 * Adresse de la borne à mettre dans le QR : une IPv4 privée d'une vraie carte (Wi-Fi, Ethernet),
 * 192.168 d'abord (box d'un particulier), puis 10, puis 172.16 ; jamais une carte virtuelle ni le
 * lien local (169.254 : pas de box). undefined : la borne n'est sur aucun réseau local.
 */
export function pickLanAddress(interfaces: Readonly<Record<string, readonly LanInterface[] | undefined>>): string | undefined {
  const rank = (ip: string) => {
    const [a] = ipv4(ip) ?? [];
    return a === 192 ? 0 : a === 10 ? 1 : a === 172 ? 2 : 3;
  };
  const found: { ip: string; rank: number; virtual: boolean }[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const i of list ?? []) {
      const v4 = i.family === 'IPv4' || i.family === 4;
      if (!v4 || i.internal || !isLocalNetworkAddress(i.address) || i.address.startsWith('169.254.') || i.address.startsWith('127.')) continue;
      found.push({ ip: i.address, rank: rank(i.address), virtual: VIRTUAL.test(name) });
    }
  }
  found.sort((x, y) => Number(x.virtual) - Number(y.virtual) || x.rank - y.rank);
  return found[0]?.ip;
}

/** Adresse du QR : la page du téléphone, la clé d'appairage dans le fragment (jamais envoyé sur le réseau). */
export function remoteUrl(host: string, port: number, key: Uint8Array): string {
  const h = host.includes(':') ? `[${host}]` : host;
  return `http://${h}:${port}/#k=${toBase64Url(key)}`;
}

// ---------------------------------------------------------------------------
// Appairage

export type RemotePhase = 'offer' | 'pending' | 'paired';

/** Ce que la borne affiche de la télécommande. */
export type RemoteView =
  | { phase: 'offer'; key: Buffer; until: number }
  | { phase: 'pending'; code: string; device: string; until: number }
  | { phase: 'paired'; code: string; device: string };

/** Réponse au premier message d'une connexion (hello), selon la clé qui l'a ouvert. */
export type RemoteHello =
  /** Clé du QR valide : le téléphone attend d'être accepté ; `session` lui est envoyée sous la clé du QR. */
  | { kind: 'claimed'; key: Buffer; session: Buffer; code: string; message: Record<string, unknown> }
  /** Clé de session : le téléphone revient (page rechargée, Wi-Fi retrouvé). */
  | { kind: 'resumed'; key: Buffer; phase: 'pending' | 'paired'; code: string; message: Record<string, unknown> }
  /**
   * Clé d'un téléphone gardé (accepté une fois à la borne) : il pilote sans QR ni acceptation.
   * `replaced` : un autre téléphone pilotait ou attendait, il cède la place.
   */
  | { kind: 'kept'; key: Buffer; id: string; device: string; replaced: boolean; message: Record<string, unknown> }
  /** Clé d'un ancien QR : périmé, ou déjà servi à un autre téléphone. La réponse part sous cette clé. */
  | { kind: 'stale'; key: Buffer; why: 'expired' | 'used' | 'busy'; message: Record<string, unknown> }
  | undefined;

/** Nom du téléphone tel qu'il se présente (« Android · Chrome ») : texte simple, court. */
export function deviceLabel(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return text || 'Téléphone'; // i18n-ignore : traduit à l'affichage (phone-remote.ts)
}

/** Téléphone gardé, tel que l'appairage le reconnaît. */
export interface KeptPhoneKey {
  id: string;
  key: Buffer;
  device: string;
}

export interface RemotePairingOptions {
  now?: () => number;
  random?: (n: number) => Buffer;
  pairingMs?: number;
  acceptMs?: number;
  /** Téléphones gardés par la borne (remote-kept.ts), relus à chaque connexion. */
  kept?: () => readonly KeptPhoneKey[];
}

/**
 * Appairage d'une ouverture du navigateur intégré. `hello` reçoit la fonction qui essaie d'ouvrir le
 * premier message d'une connexion avec une clé : elle dit laquelle des clés connues l'a scellé.
 */
export function createRemotePairing(opts: RemotePairingOptions = {}) {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? crypto.randomBytes;
  const pairingMs = opts.pairingMs ?? REMOTE_PAIRING_MS;
  const acceptMs = opts.acceptMs ?? REMOTE_ACCEPT_MS;
  let offer: { key: Buffer; until: number } | undefined;
  /** `kept` : identifiant du téléphone gardé qui pilote (il est venu avec sa clé, sans QR). */
  let session: { key: Buffer; code: string; device: string; phase: 'pending' | 'paired'; until: number; kept?: string } | undefined;
  /** Clés d'anciens QR : de quoi dire au téléphone qu'il est périmé ou déjà servi, sous sa propre clé. */
  const stale: { key: Buffer; why: 'expired' | 'used' }[] = [];
  const retire = (key: Buffer, why: 'expired' | 'used') => {
    stale.unshift({ key, why });
    stale.length = Math.min(stale.length, 6);
  };
  const code = () => String(random(4).readUInt32BE(0) % 10_000).padStart(4, '0');

  /** Un téléphone qui attend trop longtemps d'être accepté est refusé. */
  function expire(): void {
    if (session?.phase === 'pending' && now() > session.until) session = undefined;
    if (offer && now() > offer.until) {
      retire(offer.key, 'expired');
      offer = undefined;
    }
  }

  return {
    /** Ce que la borne affiche maintenant ; un QR neuf quand le précédent a expiré (et qu'aucun téléphone n'est là). */
    view(): RemoteView {
      expire();
      if (session) return session.phase === 'pending' ? { phase: 'pending', code: session.code, device: session.device, until: session.until } : { phase: 'paired', code: session.code, device: session.device };
      offer ??= { key: random(REMOTE_KEY_BYTES), until: now() + pairingMs };
      return { phase: 'offer', key: offer.key, until: offer.until };
    },
    /** Premier message d'une connexion : quelle clé l'ouvre, et ce qui s'ensuit. */
    hello(open: (key: Buffer) => unknown): RemoteHello {
      expire();
      const asMessage = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);
      if (session) {
        const message = asMessage(open(session.key));
        if (message) return { kind: 'resumed', key: session.key, phase: session.phase, code: session.code, message };
      }
      // Un téléphone gardé : il prend la main, même sur un autre (c'est celui qu'on tient qui compte).
      for (const phone of opts.kept?.() ?? []) {
        if (phone.key.length !== REMOTE_KEY_BYTES) continue;
        const message = asMessage(open(phone.key));
        if (!message) continue;
        const replaced = Boolean(session);
        session = { key: phone.key, code: '', device: phone.device, phase: 'paired', until: Infinity, kept: phone.id };
        return { kind: 'kept', key: phone.key, id: phone.id, device: phone.device, replaced, message };
      }
      if (offer) {
        const message = asMessage(open(offer.key));
        if (message) {
          const key = offer.key;
          retire(key, 'used');
          offer = undefined;
          if (session) return { kind: 'stale', key, why: 'busy', message };
          session = { key: random(REMOTE_KEY_BYTES), code: code(), device: deviceLabel(message.device), phase: 'pending', until: now() + acceptMs };
          return { kind: 'claimed', key, session: session.key, code: session.code, message };
        }
      }
      for (const old of stale) {
        const message = asMessage(open(old.key));
        if (message) return { kind: 'stale', key: old.key, why: session && old.why === 'expired' ? 'busy' : old.why, message };
      }
      return undefined;
    },
    /** Accepté à la borne. Faux si aucun téléphone n'attendait. */
    accept(): boolean {
      expire();
      if (session?.phase !== 'pending') return false;
      session.phase = 'paired';
      return true;
    },
    /** Un téléphone attend ou pilote (sans créer de QR, contrairement à view). */
    session(): 'pending' | 'paired' | undefined {
      expire();
      return session?.phase;
    },
    /**
     * Le téléphone qui pilote : sa clé (à garder, une fois accepté), son nom, et l'identifiant du
     * téléphone gardé s'il est venu avec sa clé.
     */
    current(): { key: Buffer; device: string; kept?: string } | undefined {
      expire();
      return session?.phase === 'paired' ? { key: session.key, device: session.device, ...(session.kept ? { kept: session.kept } : {}) } : undefined;
    },
    /** Le téléphone qui pilote vient d'être gardé sous cet identifiant. */
    markKept(id: string): void {
      if (session?.phase === 'paired') session.kept = id;
    },
    /** Refusé à la borne, ou déconnecté : la clé de session ne vaut plus rien, un QR neuf s'affiche. */
    end(): boolean {
      const had = Boolean(session);
      session = undefined;
      return had;
    },
    phase(): RemotePhase {
      return this.view().phase;
    },
  };
}

export type RemotePairing = ReturnType<typeof createRemotePairing>;

// ---------------------------------------------------------------------------
// Messages du téléphone

export type RemoteKey = 'Enter' | 'Tab' | 'Backspace' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Space';
const KEYS: readonly RemoteKey[] = ['Enter', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
export type RemoteNav = 'back' | 'forward' | 'home' | 'close' | 'reload';
const NAVS: readonly RemoteNav[] = ['back', 'forward', 'home', 'close', 'reload'];
/** Boutons de la borne que le téléphone tient au menu : les touches de l'interface en vigueur (interfaceKeys). */
export type RemoteButton = 'previous' | 'next' | 'confirm' | 'exit' | 'zone';
export const REMOTE_BUTTONS: readonly RemoteButton[] = ['previous', 'next', 'confirm', 'exit', 'zone'];

/** Ce que le téléphone peut demander, une fois accepté. Rien d'autre ne passe. */
export type PhoneMessage =
  | { t: 'move'; s: number; dx: number; dy: number; ms: number }
  | { t: 'click'; s: number; button: 'left' | 'right'; count: 1 | 2 }
  | { t: 'scroll'; s: number; dx: number; dy: number }
  | { t: 'text'; s: number; del: number; ins: string }
  /**
   * Tout le texte d'un champ, tapé au téléphone : au menu, celui du clavier à l'écran (une ligne) ;
   * dans le navigateur, celui d'un champ de la page repris au téléphone (saut de ligne permis d'une zone de texte).
   */
  | { t: 'set'; s: number; value: string }
  | { t: 'key'; s: number; key: RemoteKey; shift?: boolean }
  | { t: 'nav'; s: number; action: RemoteNav }
  | { t: 'act'; s: number; id: string }
  | { t: 'search'; s: number; query: string; engine?: string }
  /** Au menu : un bouton de la borne appuyé ou relâché. */
  | { t: 'btn'; s: number; b: RemoteButton; down: boolean }
  /** Envoi d'un fichier : son nom (nettoyé à la borne) et sa taille ; puis les morceaux en HTTP. */
  | { t: 'up'; s: number; name: string; size: number }
  | { t: 'up-cancel'; s: number }
  /**
   * Au menu : l'entrée `i` de l'écran envoyé sous la version `v` (message « entries », remote-menus.ts).
   * Deux nombres, jamais un libellé ni un chemin : la borne retrouve l'entrée, et l'ignore si l'écran a changé.
   */
  | { t: 'pick'; s: number; v: number; i: number }
  /** Au menu : ouvrir directement un menu par son identifiant (remoteMenuTarget), vérifié par la borne. */
  | { t: 'open'; s: number; id: string }
  /**
   * Classements (vue Scores) : le tableau d'une table pour une portée et une période. La table est
   * un rang de la liste envoyée sous la version `v` (« ranks-tables ») ; sans rang, celle que la
   * borne a choisie ou lancée. Des nombres et deux mots connus, jamais un chemin : la borne lit ses
   * propres données, en lecture seule.
   */
  | { t: 'ranks'; s: number; scope: RankingScope; period: ScorePeriod; table?: { v: number; i: number } }
  /** La vue Scores est quittée : la borne ne recalcule plus les classements pour le téléphone. */
  | { t: 'ranks-off'; s: number }
  /**
   * Messagerie pendant une partie (chat-menu.ts) : écrire à l'ami du fil montré, ou réagir à un de
   * ses messages, sans toucher aux boutons de VPX. La borne vérifie l'ami, le texte et la réaction.
   */
  | { t: 'chat-send'; s: number; key: string; text: string }
  | { t: 'chat-react'; s: number; key: string; target: string; kind: string }
  | { t: 'ping'; s: number }
  | { t: 'bye'; s: number };

const finite = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/** Lit un message ouvert du téléphone : undefined pour tout ce qui n'est pas attendu (type, bornes, longueur). */
export function parsePhoneMessage(raw: unknown): PhoneMessage | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const m = raw as Record<string, unknown>;
  const s = m.s;
  if (typeof s !== 'number' || !Number.isSafeInteger(s) || s < 1) return undefined;
  switch (m.t) {
    case 'move':
      return finite(m.dx, 4000) && finite(m.dy, 4000) ? { t: 'move', s, dx: m.dx, dy: m.dy, ms: finite(m.ms, 10_000) && m.ms > 0 ? m.ms : 16 } : undefined;
    case 'click':
      return m.button === 'left' || m.button === 'right' ? { t: 'click', s, button: m.button, count: m.count === 2 ? 2 : 1 } : undefined;
    case 'scroll':
      return finite(m.dx, 20_000) && finite(m.dy, 20_000) ? { t: 'scroll', s, dx: m.dx, dy: m.dy } : undefined;
    case 'text': {
      const del = m.del ?? 0;
      const ins = m.ins ?? '';
      if (typeof del !== 'number' || !Number.isInteger(del) || del < 0 || del > REMOTE_TEXT_MAX || typeof ins !== 'string' || [...ins].length > REMOTE_TEXT_MAX) return undefined;
      // Caractères de contrôle écartés (sauf le saut de ligne d'une zone de texte) : ils passent par les touches.
      const clean = ins.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
      return del || clean ? { t: 'text', s, del, ins: clean } : undefined;
    }
    case 'set': {
      if (typeof m.value !== 'string' || [...m.value].length > REMOTE_TEXT_MAX) return undefined;
      // Caractères de contrôle en espaces, sauf le saut de ligne (zone de texte d'une page) : le menu, lui, n'en garde aucun (phone-remote.ts).
      return { t: 'set', s, value: m.value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ') };
    }
    case 'key':
      return KEYS.includes(m.key as RemoteKey) ? { t: 'key', s, key: m.key as RemoteKey, ...(m.shift === true ? { shift: true } : {}) } : undefined;
    case 'nav':
      return NAVS.includes(m.action as RemoteNav) ? { t: 'nav', s, action: m.action as RemoteNav } : undefined;
    case 'act':
      return typeof m.id === 'string' && /^[a-z0-9:-]{1,40}$/.test(m.id) ? { t: 'act', s, id: m.id } : undefined;
    case 'search':
      if (typeof m.query !== 'string' || !m.query.trim() || m.query.length > 300) return undefined;
      // Le moteur (Web, Images, YouTube, Vidéo) : un identifiant court, vérifié ensuite par la fenêtre « Récupérer ».
      return { t: 'search', s, query: m.query.replace(/[\u0000-\u001f\u007f]/g, ' '), ...(typeof m.engine === 'string' && /^[a-z]{1,16}$/.test(m.engine) ? { engine: m.engine } : {}) };
    case 'btn':
      return REMOTE_BUTTONS.includes(m.b as RemoteButton) && typeof m.down === 'boolean' ? { t: 'btn', s, b: m.b as RemoteButton, down: m.down } : undefined;
    case 'up':
      // La taille est lue telle quelle : trop grande, la borne répond pourquoi (plutôt que couper la liaison).
      return typeof m.name === 'string' && m.name.length <= 1024 && typeof m.size === 'number' && Number.isSafeInteger(m.size) && m.size >= 0 ? { t: 'up', s, name: m.name, size: m.size } : undefined;
    case 'up-cancel':
      return { t: 'up-cancel', s };
    case 'pick':
      return typeof m.v === 'number' && Number.isSafeInteger(m.v) && m.v >= 0 && typeof m.i === 'number' && Number.isInteger(m.i) && m.i >= 0 && m.i < REMOTE_ENTRIES_MAX ? { t: 'pick', s, v: m.v, i: m.i } : undefined;
    case 'open':
      return typeof m.id === 'string' && /^[a-z0-9-]{1,40}$/.test(m.id) ? { t: 'open', s, id: m.id } : undefined;
    case 'ranks': {
      if (!RANKING_SCOPES.includes(m.scope as RankingScope) || !SCORE_PERIODS.includes(m.period as ScorePeriod)) return undefined;
      const base = { t: 'ranks' as const, s, scope: m.scope as RankingScope, period: m.period as ScorePeriod };
      if (m.v === undefined && m.i === undefined) return base;
      const index = (v: unknown, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < max;
      return index(m.v, Number.MAX_SAFE_INTEGER) && index(m.i, REMOTE_ENTRIES_MAX) ? { ...base, table: { v: m.v as number, i: m.i as number } } : undefined;
    }
    case 'ranks-off':
      return { t: 'ranks-off', s };
    case 'chat-send':
      return typeof m.key === 'string' && /^[0-9a-f]{64}$/.test(m.key) && typeof m.text === 'string' && m.text.length <= 4000 ? { t: 'chat-send', s, key: m.key, text: m.text } : undefined;
    case 'chat-react':
      return typeof m.key === 'string' && /^[0-9a-f]{64}$/.test(m.key) && typeof m.target === 'string' && /^[0-9a-f]{16}$/.test(m.target) && typeof m.kind === 'string' && /^[a-z]{1,20}$/.test(m.kind) ? { t: 'chat-react', s, key: m.key, target: m.target, kind: m.kind } : undefined;
    case 'ping':
      return { t: 'ping', s };
    case 'bye':
      return { t: 'bye', s };
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Pointeur

/**
 * Déplacement du pointeur pour un geste du pavé tactile : `dx`, `dy` en pixels du téléphone, en
 * `ms` millisecondes ; `area`, la page du site (pixels de l'écran). Un pavé de téléphone fait
 * environ 350 px de large : lentement, un glissé d'un bord à l'autre traverse un tiers de l'écran
 * (on vise un lien) ; vite, il le traverse en entier (on va à l'autre bout). Rien ne sort de la page.
 */
export function movePointer(at: { x: number; y: number }, gesture: { dx: number; dy: number; ms: number; speed?: number }, area: { width: number; height: number }): { x: number; y: number } {
  const base = Math.max(area.width, area.height) / 1100;
  const speed = gesture.speed ?? gestureSpeed(gesture);
  const gain = base * (0.9 + Math.min(2.6, Math.max(0, speed - 0.15) * 1.6));
  const clamp = (v: number, max: number) => Math.min(Math.max(0, max - 1), Math.max(0, v));
  return { x: clamp(at.x + gesture.dx * gain, area.width), y: clamp(at.y + gesture.dy * gain, area.height) };
}

/** Vitesse d'un geste du pavé, en pixels du téléphone par milliseconde. */
export function gestureSpeed(gesture: { dx: number; dy: number; ms: number }): number {
  return Math.hypot(gesture.dx, gesture.dy) / Math.max(gesture.ms, 8);
}

/**
 * Vitesse lissée sur les derniers gestes : celle d'un seul geste varie d'une image à l'autre
 * (le Wi-Fi livre les gestes par paquets, le temps mesuré entre deux est irrégulier), et
 * l'accélération faisait avancer le pointeur par à-coups (essai réel du 06/11/2026). Après une
 * pause (`gapMs` sans geste, plus de 120 ms), on repart de la vitesse du geste.
 */
export function smoothSpeed(previous: number | undefined, gesture: { dx: number; dy: number; ms: number }, gapMs: number): number {
  const now = gestureSpeed(gesture);
  return previous === undefined || gapMs > 120 ? now : previous * 0.6 + now * 0.4;
}

/**
 * Molette pour un glissé à deux doigts : la page suit les doigts (les doigts montent, la page
 * descend), comme sur le téléphone. Chromium : un delta positif fait remonter la page.
 */
export function wheelFor(gesture: { dx: number; dy: number }): { deltaX: number; deltaY: number } {
  const k = 2.2;
  return { deltaX: Math.round(gesture.dx * k), deltaY: Math.round(gesture.dy * k) };
}

// ---------------------------------------------------------------------------
// Champ de saisie de la page

export type RemoteFieldKind = 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search' | 'multiline';

/** Champ de la page qui a le clavier, tel que le téléphone l'affiche. */
export interface RemoteField {
  kind: RemoteFieldKind;
  /** Libellé du champ (étiquette, aria-label, texte d'aide), court ; vide s'il n'en a pas. */
  label: string;
  /** Son cadre a le focus de la fenêtre (document.hasFocus) : il l'emporte sur un champ resté actif ailleurs. */
  focused?: boolean;
  /**
   * Le texte du champ, repris au téléphone pour y être modifié ; absent pour un mot de passe, un
   * champ de carte ou de code à usage unique, une zone riche (contentEditable) ou un texte de plus
   * de REMOTE_TEXT_MAX caractères : le téléphone part alors d'un champ vide et tape à la suite.
   */
  value?: string;
}

/**
 * Sonde lancée dans chaque cadre de la page (executeJavaScript) : le champ de saisie qui a le
 * clavier, s'il y en a un, dans ce cadre : sa nature, son libellé, et son texte pour qu'on le
 * modifie au téléphone (essai réel du 06/11/2026 : un champ rempli y arrivait vide). Jamais le
 * texte d'un mot de passe, ni d'un champ que le site marque comme secret (carte, code à usage
 * unique, mot de passe affiché en clair), ni d'une zone riche (contentEditable).
 */
export const REMOTE_FOCUS_PROBE = `(() => {
  let e = document.activeElement;
  while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement;
  if (!e) return null;
  const tag = e.tagName;
  let kind = null;
  if (e.isContentEditable || tag === 'TEXTAREA') kind = 'multiline';
  else if (tag === 'INPUT') {
    const type = (e.getAttribute('type') || 'text').toLowerCase();
    if (['password', 'email', 'number', 'tel', 'url', 'search'].includes(type)) kind = type;
    else if (['text', ''].includes(type) || !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'range', 'color', 'hidden', 'date', 'datetime-local', 'month', 'time', 'week'].includes(type)) kind = 'text';
  }
  if (!kind || e.disabled || e.readOnly) return null;
  const byFor = e.id ? document.querySelector('label[for="' + CSS.escape(e.id) + '"]') : null;
  const near = byFor || e.closest('label');
  const label = (e.getAttribute('aria-label') || (near && near.textContent) || e.getAttribute('placeholder') || e.getAttribute('title') || e.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  const auto = (e.getAttribute('autocomplete') || '').toLowerCase();
  const secret = kind === 'password' || /(^|\\s)(cc-|one-time-code|current-password|new-password)/.test(auto);
  const text = !secret && !e.isContentEditable && typeof e.value === 'string' && Array.from(e.value).length <= ${REMOTE_TEXT_MAX} ? e.value : null;
  return { kind, label, focused: document.hasFocus(), value: text };
})()`;

/** Lit le résultat de la sonde : undefined s'il n'y a pas de champ, ou si la page a répondu autre chose. */
export function readRemoteField(raw: unknown): RemoteField | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const kinds: readonly RemoteFieldKind[] = ['text', 'password', 'email', 'number', 'tel', 'url', 'search', 'multiline'];
  if (!kinds.includes(r.kind as RemoteFieldKind)) return undefined;
  const kind = r.kind as RemoteFieldKind;
  // Jamais le texte d'un mot de passe, même si la page répondait autre chose.
  const value = kind !== 'password' && typeof r.value === 'string' && [...r.value].length <= REMOTE_TEXT_MAX ? r.value : undefined;
  return { kind, label: typeof r.label === 'string' ? r.label.replace(/[\u0000-\u001f]/g, ' ').slice(0, 60) : '', ...(r.focused === true ? { focused: true } : {}), ...(value !== undefined ? { value } : {}) };
}


// ---------------------------------------------------------------------------
// Envoi d'un fichier

/** Noms que Windows réserve à des périphériques, quelle que soit l'extension (« con.txt »). */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/**
 * Nom d'un fichier envoyé par le téléphone, tel qu'il sera rangé dans le dossier d'import : le
 * dernier élément seulement (rien d'un chemin), sans caractère interdit par Windows ni de
 * contrôle, sans point ni espace au bout, sans point au début (le dossier d'import ignore les
 * fichiers cachés), jamais un nom de périphérique, 120 caractères au plus en gardant
 * l'extension. undefined : il ne reste rien de lisible.
 */
export function cleanUploadName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined;
  let base = name.normalize('NFC').split(/[\\/]/).pop() ?? '';
  base = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');
  if (!base) return undefined;
  const dot = base.lastIndexOf('.');
  let stem = dot > 0 ? base.slice(0, dot) : base;
  let ext = dot > 0 ? base.slice(dot) : '';
  if (ext.length > 16) {
    stem = base;
    ext = '';
  }
  if (RESERVED.test(stem.split('.')[0]!.trim())) stem = `_${stem}`;
  const room = 120 - ext.length;
  if ([...stem].length > room) stem = [...stem].slice(0, room).join('').trim();
  const out = `${stem}${ext}`.replace(/[.\s]+$/, '');
  return out || undefined;
}

/** « table.zip », « table (2).zip », … : le premier nom que `taken` ne connaît pas. */
export function freeUploadName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}
