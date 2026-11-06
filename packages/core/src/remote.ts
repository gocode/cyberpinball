// Le téléphone comme télécommande de la borne (docs/recherche/telecommande-telephone.md), premier
// jalon : le navigateur intégré « Récupérer ». Une borne n'a souvent ni clavier ni souris, alors
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
//   écran verrouillé, Wi-Fi perdu un instant) tant que le navigateur intégré reste ouvert ;
// - un seul téléphone à la fois : le QR disparaît tant qu'un téléphone attend ou pilote ;
// - tout s'efface à la fermeture du navigateur intégré (createRemotePairing est recréé).
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
  /** Clé d'un ancien QR : périmé, ou déjà servi à un autre téléphone. La réponse part sous cette clé. */
  | { kind: 'stale'; key: Buffer; why: 'expired' | 'used' | 'busy'; message: Record<string, unknown> }
  | undefined;

/** Nom du téléphone tel qu'il se présente (« Android · Chrome ») : texte simple, court. */
export function deviceLabel(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return text || 'Téléphone'; // i18n-ignore : traduit à l'affichage (phone-remote.ts)
}

export interface RemotePairingOptions {
  now?: () => number;
  random?: (n: number) => Buffer;
  pairingMs?: number;
  acceptMs?: number;
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
  let session: { key: Buffer; code: string; device: string; phase: 'pending' | 'paired'; until: number } | undefined;
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

/** Ce que le téléphone peut demander, une fois accepté. Rien d'autre ne passe. */
export type PhoneMessage =
  | { t: 'move'; s: number; dx: number; dy: number; ms: number }
  | { t: 'click'; s: number; button: 'left' | 'right'; count: 1 | 2 }
  | { t: 'scroll'; s: number; dx: number; dy: number }
  | { t: 'text'; s: number; del: number; ins: string }
  | { t: 'key'; s: number; key: RemoteKey; shift?: boolean }
  | { t: 'nav'; s: number; action: RemoteNav }
  | { t: 'act'; s: number; id: string }
  | { t: 'search'; s: number; query: string }
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
    case 'key':
      return KEYS.includes(m.key as RemoteKey) ? { t: 'key', s, key: m.key as RemoteKey, ...(m.shift === true ? { shift: true } : {}) } : undefined;
    case 'nav':
      return NAVS.includes(m.action as RemoteNav) ? { t: 'nav', s, action: m.action as RemoteNav } : undefined;
    case 'act':
      return typeof m.id === 'string' && /^[a-z0-9:-]{1,40}$/.test(m.id) ? { t: 'act', s, id: m.id } : undefined;
    case 'search':
      return typeof m.query === 'string' && m.query.trim() && m.query.length <= 300 ? { t: 'search', s, query: m.query.replace(/[\u0000-\u001f\u007f]/g, ' ') } : undefined;
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
export function movePointer(at: { x: number; y: number }, gesture: { dx: number; dy: number; ms: number }, area: { width: number; height: number }): { x: number; y: number } {
  const base = Math.max(area.width, area.height) / 1100;
  const speed = Math.hypot(gesture.dx, gesture.dy) / Math.max(gesture.ms, 8);
  const gain = base * (0.9 + Math.min(2.6, Math.max(0, speed - 0.15) * 1.6));
  const clamp = (v: number, max: number) => Math.min(Math.max(0, max - 1), Math.max(0, v));
  return { x: clamp(at.x + gesture.dx * gain, area.width), y: clamp(at.y + gesture.dy * gain, area.height) };
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
}

/**
 * Sonde lancée dans chaque cadre de la page (executeJavaScript) : le champ de saisie qui a le
 * clavier, s'il y en a un, dans ce cadre. Elle ne lit jamais la valeur du champ (un mot de passe) :
 * seulement sa nature et son libellé.
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
  return { kind, label, focused: document.hasFocus() };
})()`;

/** Lit le résultat de la sonde : undefined s'il n'y a pas de champ, ou si la page a répondu autre chose. */
export function readRemoteField(raw: unknown): RemoteField | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const kinds: readonly RemoteFieldKind[] = ['text', 'password', 'email', 'number', 'tel', 'url', 'search', 'multiline'];
  if (!kinds.includes(r.kind as RemoteFieldKind)) return undefined;
  return { kind: r.kind as RemoteFieldKind, label: typeof r.label === 'string' ? r.label.replace(/[\u0000-\u001f]/g, ' ').slice(0, 60) : '', ...(r.focused === true ? { focused: true } : {}) };
}
