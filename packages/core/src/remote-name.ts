// Le nom de la borne sur le réseau local, pour le téléphone gardé (12/11/2026). Cyber Pinball annonce
// son propre nom, « cyberpinball.local », par son propre répondeur mDNS (app/src/mdns-responder.ts) :
// jamais le nom de la machine Windows, qui n'est ni le nôtre ni forcément un nom réseau. Une autre
// borne le porte déjà sur le réseau : « cyberpinball-2.local », puis -3… ; le nom choisi est retenu
// et redemandé d'abord au démarrage suivant (un téléphone gardé le retrouve).
//
// Le répondeur écoute UDP 5353 comme CyberPinball.exe, que sa règle du pare-feu autorise déjà en
// entrée : il ne dépend ni de la règle mDNS de Windows, ni de son réglage EnableMDNS, ni du profil du
// réseau.
//
// Ce que le nom ne fait pas : les navigateurs d'Android (Chrome, Brave…) ne résolvent pas les noms en
// « .local » (essai du PinCab, 12/11/2026 : Android avec Brave, jamais passé par le nom). Seuls
// l'iPhone (Safari) et les ordinateurs le trouvent. La page le dit à la borne (message « name ») et
// à son utilisateur, et reste sur l'adresse IP. Pour Android, seule une entrée stable sur un domaine
// public suivrait un changement d'adresse (pas encore décidé).
//
// Paquets mDNS (RFC 6762) : la question (lue sur le répondeur), la réponse A (cache-flush, 120 s),
// la requête de sondage (identifiant 0, bit « réponse en unicast »).

import { t } from './i18n';

/** Le nom de base de la borne sur le réseau local. */
export const REMOTE_NAME_BASE = 'cyberpinball';

/** Le n-ième nom à essayer : cyberpinball.local, puis cyberpinball-2.local… */
export function remoteMdnsName(n: number): string {
  return n <= 1 ? `${REMOTE_NAME_BASE}.local` : `${REMOTE_NAME_BASE}-${Math.floor(n)}.local`;
}

/** Le rang d'un nom de la borne (1 pour cyberpinball.local) ; undefined pour tout autre nom. */
export function remoteMdnsRank(name: string | undefined): number | undefined {
  const m = new RegExp(`^${REMOTE_NAME_BASE}(?:-(\\d{1,2}))?\\.local$`).exec(name ?? '');
  if (!m) return undefined;
  const n = m[1] ? Number(m[1]) : 1;
  return m[1] && n < 2 ? undefined : n;
}

/** Ce que la page du téléphone a obtenu du nom (moveToName) : passée, nom injoignable, autre borne. */
export type RemotePhoneNameResult = 'ok' | 'unreachable' | 'other';
export const REMOTE_PHONE_NAME_RESULTS = ['ok', 'unreachable', 'other'] as const satisfies readonly RemotePhoneNameResult[];

export interface RemoteNameFacts {
  /** Le nom annoncé ; absent si le répondeur n'a pas pu démarrer. */
  name?: string;
  /** Pourquoi il n'y a pas de nom (port 5353 refusé, pas de carte réseau…). */
  error?: string;
  /** Les noms d'avant déjà pris par un autre appareil du réseau, et son adresse. */
  taken?: { name: string; by: string }[];
  /** Le dernier téléphone gardé qui n'a pas joint la borne par son nom, et pourquoi. */
  phone?: { result: Exclude<RemotePhoneNameResult, 'ok'>; device: string; android: boolean };
}

export const MDNS_GROUP = '224.0.0.251';
export const MDNS_PORT = 5353;
/** Durée de vie annoncée de la réponse (secondes). */
export const MDNS_TTL = 120;

function encodeName(name: string): Buffer {
  const parts = name
    .split('.')
    .filter(Boolean)
    .map((l) => {
      const b = Buffer.from(l, 'utf8');
      return Buffer.concat([Buffer.from([b.length]), b]);
    });
  return Buffer.concat([...parts, Buffer.from([0])]);
}

/** Requête mDNS d'une adresse IPv4 (type A), réponse demandée en unicast (bit QU), identifiant 0. */
export function mdnsQuery(name: string): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), encodeName(name), Buffer.from([0, 1, 0x80, 1])]);
}

/** Lit un nom DNS (pointeurs de compression compris) ; undefined s'il déborde ou boucle. */
function readName(msg: Buffer, at: number): { name: string; end: number } | undefined {
  const labels: string[] = [];
  let pos = at;
  let end: number | undefined;
  for (let jumps = 0; jumps < 20; ) {
    if (pos >= msg.length) return undefined;
    const len = msg[pos]!;
    if (len === 0) return { name: labels.join('.'), end: end ?? pos + 1 };
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= msg.length) return undefined;
      end ??= pos + 2;
      pos = ((len & 0x3f) << 8) | msg[pos + 1]!;
      jumps++;
      continue;
    }
    if (pos + 1 + len > msg.length) return undefined;
    labels.push(msg.subarray(pos + 1, pos + 1 + len).toString('utf8'));
    pos += 1 + len;
  }
  return undefined;
}

/** Une requête mDNS : son identifiant et ses questions (nom en minuscules, type, bit QU). Undefined pour une réponse. */
export function mdnsQuestions(msg: Buffer): { id: number; questions: { name: string; type: number; unicast: boolean }[] } | undefined {
  if (msg.length < 12 || msg[2]! & 0x80) return undefined;
  const qd = Math.min(msg.readUInt16BE(4), 32);
  const questions: { name: string; type: number; unicast: boolean }[] = [];
  let pos = 12;
  for (let i = 0; i < qd; i++) {
    const n = readName(msg, pos);
    if (!n || n.end + 4 > msg.length) break;
    questions.push({ name: n.name.toLowerCase(), type: msg.readUInt16BE(n.end), unicast: Boolean(msg.readUInt16BE(n.end + 2) & 0x8000) });
    pos = n.end + 4;
  }
  return { id: msg.readUInt16BE(0), questions };
}

/** Les adresses IPv4 qu'une réponse mDNS donne pour `name` (enregistrements A des réponses et compléments). */
export function mdnsAddresses(msg: Buffer, name: string): string[] {
  if (msg.length < 12 || !(msg[2]! & 0x80)) return [];
  const qd = msg.readUInt16BE(4);
  const records = msg.readUInt16BE(6) + msg.readUInt16BE(8) + msg.readUInt16BE(10);
  let pos = 12;
  for (let i = 0; i < qd; i++) {
    const n = readName(msg, pos);
    if (!n) return [];
    pos = n.end + 4;
  }
  const out: string[] = [];
  for (let i = 0; i < records; i++) {
    const n = readName(msg, pos);
    if (!n || n.end + 10 > msg.length) break;
    const type = msg.readUInt16BE(n.end);
    const size = msg.readUInt16BE(n.end + 8);
    const data = n.end + 10;
    if (data + size > msg.length) break;
    if (type === 1 && size === 4 && n.name.toLowerCase() === name.toLowerCase()) out.push([...msg.subarray(data, data + 4)].join('.'));
    pos = data + size;
  }
  return out;
}

/**
 * La réponse A de la borne pour `name` : `legacy` (question d'un port autre que 5353), même
 * identifiant et la question répétée, sans cache-flush (RFC 6762, 6.7) ; sinon identifiant 0.
 */
export function mdnsAnswer(name: string, ip: string, legacy?: { id: number }): Buffer {
  const encoded = encodeName(name);
  const header = Buffer.from([0, 0, 0x84, 0, 0, legacy ? 1 : 0, 0, 1, 0, 0, 0, 0]);
  if (legacy) header.writeUInt16BE(legacy.id, 0);
  const question = legacy ? Buffer.concat([encoded, Buffer.from([0, 1, 0, 1])]) : Buffer.alloc(0);
  const ttl = Buffer.alloc(4);
  ttl.writeUInt32BE(legacy ? 10 : MDNS_TTL);
  const rr = Buffer.concat([encoded, Buffer.from([0, 1, legacy ? 0 : 0x80, 1]), ttl, Buffer.from([0, 4, ...ip.split('.').map(Number)])]);
  return Buffer.concat([header, question, rr]);
}

/** Les types de question auxquels la borne répond : A et ANY. */
export function mdnsAsksAddress(type: number): boolean {
  return type === 1 || type === 255;
}

/** Un téléphone Android, d'après son nom d'appareil (deviceName : « Android · Chrome »). */
export function isAndroidDevice(device: string): boolean {
  return /^Android\b/.test(device);
}

/** Ce que l'écran de la télécommande et la Santé disent du nom : titre, détail, état. */
export function remoteNameSummary(f: RemoteNameFacts): { state: 'ok' | 'check'; title: string; detail: string } {
  const ip = t('Le téléphone gardé passe par l’adresse IP de la borne : si le routeur la change, il devra scanner le QR une fois.');
  if (!f.name) return { state: 'check', title: t('Pas de nom sur le réseau'), detail: `${ip} ${t('Cyber Pinball n’a pas pu annoncer son nom ({error}) : un redémarrage du PC libère le réseau local.', { error: f.error ?? '?' })}` };
  if (f.phone)
    return {
      state: 'check',
      title: f.phone.result === 'other' ? t('Le nom {name} mène à une autre borne', { name: f.name }) : t('Un téléphone ne trouve pas la borne par son nom'),
      detail:
        f.phone.result === 'other'
          ? t('{device} reste sur l’adresse IP de la borne : relancez Cyber Pinball sur l’une des deux bornes, chacune prend alors un nom à elle.', { device: f.phone.device })
          : f.phone.android
            ? t('{device} : les navigateurs d’Android ne trouvent pas les noms en « .local ». Il reste sur l’adresse IP, et devra scanner le QR une fois si le routeur la change.', { device: f.phone.device })
            : t('{device} ne trouve pas le nom (Wi-Fi qui isole les appareils, ou navigateur sans mDNS) : il reste sur l’adresse IP, et devra scanner le QR une fois si elle change.', { device: f.phone.device }),
    };
  const taken = f.taken?.length ? ` ${t('{names} : déjà pris par un autre appareil du réseau.', { names: f.taken.map((x) => x.name).join(', ') })}` : '';
  return { state: 'ok', title: t('Nom sur le réseau : {name}', { name: f.name }), detail: `${t('Un iPhone gardé retrouve la borne par ce nom, même si son adresse change ; un téléphone Android passe par l’adresse IP.')}${taken}` };
}
