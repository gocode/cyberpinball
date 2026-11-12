// Le répondeur mDNS de Cyber Pinball (packages/core/src/remote-name.ts) : il annonce le nom de la
// borne, « cyberpinball.local », sur la carte réseau où la page du téléphone est servie, et ne répond
// qu'à ce nom, par son adresse IPv4. Jamais le nom de la machine Windows.
//
// Au départ, il sonde (RFC 6762, 8.1) : trois requêtes pour le nom, 250 ms d'écart ; un autre
// appareil répond, le nom est pris, il essaie le suivant (cyberpinball-2.local…). Le nom retenu au
// démarrage précédent est essayé d'abord : un téléphone gardé par lui le retrouve. Puis il s'annonce
// deux fois et répond aux questions : en multidiffusion, en unicast si la question le demande (bit
// QU), ou à l'ancienne (question venue d'un autre port que 5353 : même identifiant, à ce port). Un
// autre appareil qui se met à répondre au même nom : il en prend un autre.
//
// UDP 5353, partagé avec le service DNS client de Windows (reuseAddr). CyberPinball.exe a déjà sa
// règle d'entrée dans le pare-feu de Windows : rien d'autre à autoriser. Le transport est remplaçable
// (essais : aucun paquet ne part sur le vrai réseau).

import * as dgram from 'node:dgram';
import {
  isAndroidDevice,
  MDNS_GROUP,
  MDNS_PORT,
  mdnsAddresses,
  mdnsAnswer,
  mdnsAsksAddress,
  mdnsQuery,
  mdnsQuestions,
  remoteMdnsName,
  remoteMdnsRank,
  type RemoteNameFacts,
  type RemotePhoneNameResult,
} from '@cyberpinball/core';

export interface MdnsTransport {
  send(message: Buffer, port: number, address: string): void;
  onMessage(listener: (message: Buffer, from: { address: string; port: number }) => void): void;
  close(): void;
}

/** Le vrai transport : UDP 5353 partagé, groupe 224.0.0.251 rejoint sur la carte `host`. */
export async function udpMdnsTransport(host: string): Promise<MdnsTransport> {
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.bind(MDNS_PORT, () => {
      s.off('error', reject);
      resolve();
    });
  });
  try {
    s.addMembership(MDNS_GROUP, host);
    s.setMulticastInterface(host);
    s.setMulticastTTL(255);
  } catch (error) {
    s.close();
    throw error;
  }
  s.on('error', () => undefined);
  return {
    send: (message, port, address) => s.send(message, port, address, () => undefined),
    onMessage: (listener) => s.on('message', (m, r) => listener(m, { address: r.address, port: r.port })),
    close: () => {
      try {
        s.close();
      } catch {
        // Déjà fermé.
      }
    },
  };
}

/** Au-delà, la borne renonce à un nom (un réseau qui répond à tout). */
const MAX_RANK = 20;
const PROBE_MS = 250;

export interface MdnsResponderOptions {
  log?(line: string): void;
  /** Le nom retenu au démarrage précédent, et où retenir le nouveau (remote-kept.ts). */
  preferred?(): string | undefined;
  remember?(name: string): void;
  transport?(host: string): Promise<MdnsTransport>;
  wait?(ms: number): Promise<void>;
}

export type MdnsResponder = ReturnType<typeof createMdnsResponder>;

export function createMdnsResponder(o: MdnsResponderOptions = {}) {
  const log = o.log ?? (() => undefined);
  const wait = o.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.()));
  let host: string | undefined;
  let transport: MdnsTransport | undefined;
  let name: string | undefined;
  let probing: string | undefined;
  let clash = false;
  let error: string | undefined;
  let taken: { name: string; by: string }[] = [];
  let phone: RemoteNameFacts['phone'];
  /** Chaque départ a son numéro : un sondage d'un départ précédent s'arrête. */
  let run = 0;

  function reply(question: { id: number; unicast: boolean }, from: { address: string; port: number }): void {
    if (!transport || !name || !host) return;
    if (from.port !== MDNS_PORT) transport.send(mdnsAnswer(name, host, { id: question.id }), from.port, from.address);
    else if (question.unicast) transport.send(mdnsAnswer(name, host), from.port, from.address);
    else transport.send(mdnsAnswer(name, host), MDNS_PORT, MDNS_GROUP);
  }

  function onMessage(message: Buffer, from: { address: string; port: number }): void {
    if (from.address === host) return; // Nos propres paquets, revenus par la boucle locale.
    const q = mdnsQuestions(message);
    if (q) {
      const asked = q.questions.find((x) => x.name === name && mdnsAsksAddress(x.type));
      if (asked) reply({ id: q.id, unicast: asked.unicast }, from);
      return;
    }
    if (probing && mdnsAddresses(message, probing).length) {
      clash = true;
      taken = [...taken.filter((x) => x.name !== probing), { name: probing, by: from.address }];
      return;
    }
    if (name && mdnsAddresses(message, name).length) {
      // Un autre appareil s'est mis à répondre à notre nom : la borne en prend un autre.
      const lost = name;
      taken = [...taken.filter((x) => x.name !== lost), { name: lost, by: from.address }];
      name = undefined;
      log(`Télécommande : ${lost} répond aussi depuis ${from.address} ; la borne prend un autre nom.`); // i18n-ignore : journal
      void claim(run, (remoteMdnsRank(lost) ?? 1) + 1);
    }
  }

  /** Sonde les noms à partir du rang `from` (le retenu d'abord), garde le premier libre, s'annonce. */
  async function claim(mine: number, from?: number): Promise<void> {
    const remembered = remoteMdnsRank(o.preferred?.());
    const order = from ? [] : remembered ? [remembered] : [];
    for (let n = from ?? 1; n <= MAX_RANK; n++) if (!order.includes(n)) order.push(n);
    for (const rank of order) {
      const candidate = remoteMdnsName(rank);
      if (taken.some((x) => x.name === candidate)) continue;
      probing = candidate;
      clash = false;
      for (let i = 0; i < 3 && !clash; i++) {
        transport?.send(mdnsQuery(candidate), MDNS_PORT, MDNS_GROUP);
        await wait(PROBE_MS);
        if (mine !== run) return;
      }
      probing = undefined;
      if (clash) continue;
      name = candidate;
      error = undefined;
      o.remember?.(candidate);
      const others = taken.length ? ` (${taken.map((x) => `${x.name} déjà pris par ${x.by}`).join(', ')})` : ''; // i18n-ignore : journal
      log(`Télécommande : la borne s'annonce sur le réseau local sous le nom ${candidate}${others}.`); // i18n-ignore : journal
      for (let i = 0; i < 2 && mine === run && name === candidate && host; i++) {
        transport?.send(mdnsAnswer(candidate, host), MDNS_PORT, MDNS_GROUP);
        await wait(1000);
      }
      return;
    }
    error = 'aucun nom libre'; // i18n-ignore : raison au journal et dans la Santé
    log(`Télécommande : aucun nom libre de ${remoteMdnsName(1)} à ${remoteMdnsName(MAX_RANK)} ; le téléphone reste sur l'adresse IP.`); // i18n-ignore : journal
  }

  function stop(): void {
    run++;
    transport?.close();
    transport = undefined;
    name = undefined;
    probing = undefined;
  }

  return {
    /** Annonce le nom sur la carte `host` (rien si c'est déjà fait) ; une autre carte : tout repart. */
    async start(at: string): Promise<void> {
      if (at === host && transport) return;
      stop();
      host = at;
      taken = [];
      const mine = run;
      try {
        const t = await (o.transport ?? udpMdnsTransport)(at);
        if (mine !== run) return t.close();
        transport = t;
      } catch (e) {
        error = (e as Error).message;
        log(`Télécommande : nom de la borne pas annoncé (${error}) ; le téléphone reste sur l'adresse IP.`); // i18n-ignore : journal
        return;
      }
      transport.onMessage(onMessage);
      await claim(mine);
    },
    /** Le nom annoncé, une fois le sondage fini. */
    name: (): string | undefined => name,
    /** Ce que la page a obtenu du nom : le dernier échec est gardé pour la Santé ; une réussite l'efface. */
    phoneResult(result: RemotePhoneNameResult, device: string): void {
      if (result === 'ok') {
        if (phone?.device === device) phone = undefined;
      } else phone = { result, device, android: isAndroidDevice(device) };
    },
    /** Pendant le sondage, rien encore (undefined). */
    facts: (): RemoteNameFacts | undefined => (host && (name || error) ? { ...(name ? { name } : {}), ...(error && !name ? { error } : {}), ...(taken.length ? { taken } : {}), ...(phone && name ? { phone } : {}) } : undefined),
    close: stop,
  };
}
