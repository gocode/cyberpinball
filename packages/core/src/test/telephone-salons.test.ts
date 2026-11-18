// Salons au téléphone, lot 3 (18/11/2026) : le salon choisi au téléphone (room-open), indépendant de la
// borne ; chaque ligne avec son identifiant, son auteur, ses réactions et la mienne ; une ligne masquée
// par la modération l'est aussi au téléphone (elle s'y lisait en clair) ; les gestes sur une ligne
// (room-act) vérifiés par la borne, ligne retrouvée dans ce salon seulement. Module : app/src/rooms-menu.ts
// (compilé), avec un réseau d'essai ; le parcours dans la vraie page : telecommande.test.ts.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { parsePhoneMessage } from '../remote';
import { newRoomsState, type RoomLine, type RoomReaction, type RoomsState } from '../rooms';
import { REPO_ROOT } from './i18n-scan';
import { fakeMenuLibrary, fakeSocialNet } from './doublures';

const ME = 'a'.repeat(64);
const KIKO = 'b'.repeat(64);
const NOVA = 'c'.repeat(64);
const at = (min: number) => new Date(Date.UTC(2026, 10, 18, 20, min)).toISOString();
const line = (id: string, room: string, key: string, name: string, text: string, min: number): RoomLine => ({ id, room, key, name, text, at: at(min), sig: 'x' });

test('salons au téléphone : room-open et room-act bornés par le cœur', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'room-open', s: 2, room: 'pays-BE' }), { t: 'room-open', s: 2, room: 'pays-BE' });
  assert.deepEqual(parsePhoneMessage({ t: 'room-open', s: 2 }), { t: 'room-open', s: 2 }, 'sans salon : celui de la borne');
  assert.equal(parsePhoneMessage({ t: 'room-open', s: 2, room: 'pays-fr' }), undefined);
  assert.equal(parsePhoneMessage({ t: 'room-open', s: 2, room: '../x' }), undefined);
  const id = '0123456789abcdef';
  assert.deepEqual(parsePhoneMessage({ t: 'room-act', s: 3, room: 'monde', line: id, a: 'react:like' }), { t: 'room-act', s: 3, room: 'monde', line: id, a: 'react:like' });
  assert.deepEqual(parsePhoneMessage({ t: 'room-act', s: 3, room: 'monde', line: id, a: 'report', reason: 'spam' }), { t: 'room-act', s: 3, room: 'monde', line: id, a: 'report', reason: 'spam' });
  assert.equal(parsePhoneMessage({ t: 'room-act', s: 3, room: 'monde', line: id, a: 'supprimer-tout' }), undefined, 'un geste inconnu');
  assert.equal(parsePhoneMessage({ t: 'room-act', s: 3, room: 'monde', line: 'court', a: 'block' }), undefined);
  assert.equal(parsePhoneMessage({ t: 'room-act', s: 3, room: 'monde', line: id, a: 'report', reason: 'Spam !' }), undefined);
});

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRoomsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'rooms-menu.js')) as {
  createRoomsMenu(host: object): {
    remote(room?: string): {
      room: string;
      name: string;
      lines: { id?: string; key?: string; text: string; kind: string; reacts?: string; mine?: string; friend?: boolean }[];
      rooms?: { room: string; name: string }[];
      countries?: string[];
      reactions?: { id: string; label: string }[];
      reasons?: { id: string; label: string }[];
      notice?: { text: string; tone: string };
    };
    remoteAct(room: string, line: string, act: string, reason?: string): void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function harness() {
  const reactions: RoomReaction[] = [
    { id: '1111111111111111', room: 'pays-FR', key: NOVA, name: 'Nova', kind: 'like', at: at(2), sig: 'x' },
    { id: '1111111111111111', room: 'pays-FR', key: ME, name: 'Moi', kind: 'haha', at: at(3), sig: 'x' },
  ];
  let rooms: RoomsState = {
    ...newRoomsState(),
    rulesAt: '2026-11-13T19:00:00Z',
    lines: [
      line('1111111111111111', 'pays-FR', KIKO, 'Kiko', 'Quelqu’un sur Neon Abyss ?', 1),
      line('2222222222222222', 'pays-FR', NOVA, 'Nova', 'texte injurieux', 2),
      line('3333333333333333', 'pays-FR', ME, 'Moi', 'Ma ligne', 3),
      line('4444444444444444', 'pays-BE', KIKO, 'Kiko', 'Salut la Belgique', 4),
    ],
    reactions,
  };
  const calls: string[] = [];
  const me = { enabled: true, name: 'Moi', key: { publicKey: ME }, blocked: [] as string[], friends: [{ key: NOVA, name: 'Nova' }], incoming: [], outgoing: [], declined: [] };
  const net = fakeSocialNet({
    state: () => me,
    country: () => 'FR',
    rooms: () => rooms,
    setRooms: (change: Partial<RoomsState>) => (rooms = { ...rooms, ...change }),
    status: () => ({ running: true }),
    moderation: () => ({ acts: [{ id: 'h1', by: 'm', kind: 'hide', target: '2222222222222222', at: at(5), sig: 'x' }], reports: [] }),
    onRoomLines: () => () => undefined,
    roomReact: (id: string, kind: string | null) => (calls.push(`react:${id.slice(0, 1)}:${kind}`), true),
    roomRetract: (id: string) => (calls.push(`retract:${id.slice(0, 1)}`), true),
    request: (p: { key: string }) => void calls.push(`request:${p.key.slice(0, 1)}`),
    report: (l: RoomLine, reason: string) => void calls.push(`report:${l.id.slice(0, 1)}:${reason}`),
    block: (key: string) => void calls.push(`block:${key.slice(0, 1)}`),
  });
  const menu = createRoomsMenu({
    library: fakeMenuLibrary(),
    net,
    openProfile: () => undefined,
    openFriend: () => undefined,
    currentTable: () => undefined,
    phoneLinked: () => true,
    now: () => new Date(Date.UTC(2026, 10, 18, 20, 30)),
  });
  return { menu, calls, setRooms: (r: Partial<RoomsState>) => (rooms = { ...rooms, ...r }) };
}

test('salons au téléphone : le salon choisi, ses lignes (identité, réactions, la mienne), une ligne masquée l’est aussi', () => {
  const { menu } = harness();
  const fr = menu.remote();
  assert.equal(fr.room, 'pays-FR', 'sans choix : le salon par défaut (mon pays)');
  const [kiko, hidden, mine] = fr.lines;
  assert.equal(kiko?.id, '1111111111111111');
  assert.equal(kiko?.key, KIKO);
  assert.equal(kiko?.mine, 'haha', 'ma réaction sur cette ligne');
  assert.ok(kiko?.reacts?.includes('👍') && kiko.reacts.includes('😆'), 'ses réactions en pastilles');
  assert.equal(hidden?.kind, 'masked');
  assert.ok(!hidden?.text.includes('injurieux') && hidden?.reacts === undefined, 'masquée par la modération : ni son texte ni ses réactions au téléphone');
  assert.equal(mine?.kind, 'own');
  assert.equal(fr.lines.find((l) => l.key === NOVA)?.friend, true, 'un ami est marqué (pas de demande d’ami à lui proposer)');
  assert.deepEqual(fr.rooms?.map((r) => r.room).slice(0, 2), ['pays-FR', 'monde'], 'en tête : mon pays, puis Monde');
  assert.ok(fr.rooms?.some((r) => r.room === 'pays-BE'), 'les salons où l’on parle');
  assert.ok((fr.countries?.length ?? 0) > 100 && fr.countries?.includes('BE'), 'les pays pour « Autres pays… »');
  assert.equal(fr.reactions?.length, 7);
  assert.equal(fr.reasons?.length, 5);
  const be = menu.remote('pays-BE');
  assert.equal(be.room, 'pays-BE', 'le salon choisi au téléphone, indépendant de la borne');
  assert.deepEqual(be.lines.map((l) => l.text), ['Salut la Belgique']);
  assert.equal(menu.remote('pas-un-salon').room, 'pays-FR', 'un salon inconnu : le salon par défaut');
});

test('salons au téléphone : chaque geste vérifié par la borne, sur une ligne de ce salon seulement', () => {
  const h = harness();
  const kiko = '1111111111111111';
  h.menu.remoteAct('pays-FR', kiko, 'react:like');
  h.menu.remoteAct('pays-FR', kiko, 'unreact');
  h.menu.remoteAct('pays-FR', kiko, 'react:inconnue');
  h.menu.remoteAct('pays-BE', kiko, 'react:like');
  assert.deepEqual(h.calls, ['react:1:like', 'react:1:null'], 'réagir, retirer ; une réaction inconnue, ou une ligne d’un autre salon : rien');
  h.calls.length = 0;
  h.menu.remoteAct('pays-FR', '2222222222222222', 'react:like');
  assert.deepEqual(h.calls, [], 'une ligne masquée ne se réagit pas');
  h.menu.remoteAct('pays-FR', kiko, 'report', 'insults');
  h.menu.remoteAct('pays-FR', kiko, 'report', 'pas-une-raison');
  h.menu.remoteAct('pays-FR', kiko, 'request');
  h.menu.remoteAct('pays-FR', '2222222222222222', 'request');
  h.menu.remoteAct('pays-FR', kiko, 'block');
  assert.deepEqual(h.calls, ['report:1:insults', 'request:b', 'block:b'], 'signaler avec une raison connue ; pas de demande à un ami');
  assert.equal(h.menu.remote().notice?.text.includes('Kiko'), true, 'le constat du dernier geste part au téléphone');
  h.calls.length = 0;
  h.menu.remoteAct('pays-FR', kiko, 'retract');
  h.menu.remoteAct('pays-FR', '3333333333333333', 'block');
  h.menu.remoteAct('pays-FR', '3333333333333333', 'retract');
  assert.deepEqual(h.calls, ['retract:3'], 'on ne retire que sa propre ligne, on ne se bloque pas soi-même');
  h.calls.length = 0;
  h.setRooms({ rulesAt: undefined });
  h.menu.remoteAct('pays-FR', kiko, 'react:like');
  assert.deepEqual(h.calls, [], 'règles pas encore acceptées : rien ne part');
  assert.equal(h.menu.remote().notice?.tone, 'warning', 'et le téléphone dit pourquoi');
});
