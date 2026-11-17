// Personnes invitées (invitations.ts, 17/11/2026) : l'attestation est signée par la personne invitée
// et refusée si on la change ; elle ne naît qu'à sa première partie menée au bout, d'une invitation
// déclarée ; l'inviteur compte une machine et un joueur une fois, jamais sa propre machine ; la carte
// publique transporte les attestations et toute borne recompte (une fausse ne compte pas) ; les XP
// (une fois, puis à chaque palier) et les badges de la famille Communauté ; la vraisemblance du niveau
// en tient compte ; les cartes d'un message restent sous la limite du réseau ; les contributions
// (avis, propositions) ; et le vocabulaire : jamais « parrain » ni « filleul » à l'écran.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { BADGES, evaluateBadges } from '../badges';
import { contributionsCount, emptyContributions, noteProposals, noteReport, PROPOSALS_LIST_MAX, type Proposal } from '../feedback';
import {
  cardInvites,
  confirmInvitation,
  declareInviter,
  declineInviter,
  emptyInvitations,
  forgetInvited,
  inviterAsked,
  invitedOf,
  INVITES_IN_CARD,
  loadInvitations,
  machineTag,
  receiveInvited,
  saveInvitations,
  signInvitation,
  verifyInvitation,
  type Invitation,
} from '../invitations';
import { emptyLevels, invitedGains, INVITED_XP_MAX, plausibleXp, shownLevel, XP } from '../levels';
import { CARDS_BYTES, emptyProfiles, makeCard, verifyCard, withinBytes, type PublicCard } from '../publicprofile';
import { createPlayerKey, type PlayerKey } from '../sharing';
import { newSocialState, setName } from '../social';
import { REPO_ROOT } from './i18n-scan';

const T0 = new Date('2026-11-17T20:00:00Z');
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

function invitee(inviter: string, n: number): { key: PlayerKey; inv: Invitation } {
  const key = createPlayerKey();
  return { key, inv: signInvitation(key, `Joueur ${n}`, inviter, machineTag(`machine-${n}`), later(n)) };
}

test('attestation : signée par la personne invitée, refusée si on la change', () => {
  const kiko = createPlayerKey();
  const { inv } = invitee(kiko.publicKey, 1);
  assert.ok(verifyInvitation(inv, later(10)));
  assert.equal(verifyInvitation({ ...inv, by: createPlayerKey().publicKey }, later(10)), undefined, 'autre inviteur');
  assert.equal(verifyInvitation({ ...inv, machine: machineTag('autre') }, later(10)), undefined, 'autre machine');
  assert.equal(verifyInvitation({ ...inv, by: inv.me }, later(10)), undefined, 'soi-même');
  assert.equal(verifyInvitation(inv, new Date(T0.getTime() - 3600_000)), undefined, 'venue du futur');
  assert.match(machineTag('{ABCDEF}'), /^[0-9a-f]{16}$/);
  assert.equal(machineTag(' ABC '), machineTag('abc'));
});

test('côté invité : rien sans déclaration, une attestation à la première partie, puis plus rien à changer', () => {
  const me = createPlayerKey();
  const kiko = createPlayerKey().publicKey;
  let s = emptyInvitations();
  assert.equal(confirmInvitation(s, me, 'Bruno', machineTag('m'), T0).invitation, undefined, 'rien de déclaré');
  assert.ok(inviterAsked(s, T0.toISOString(), later(60)));
  assert.equal(inviterAsked(s, T0.toISOString(), new Date(T0.getTime() + 31 * 86_400_000)), false, 'plus après un mois');
  assert.equal(declareInviter(s, me.publicKey, 'Moi', me.publicKey), s, 'pas soi-même');
  s = declareInviter(s, kiko, 'Kiko', me.publicKey, T0);
  assert.equal(inviterAsked(s, T0.toISOString(), later(1)), false);
  const r = confirmInvitation(s, me, 'Bruno', machineTag('m'), later(5));
  assert.ok(r.invitation && verifyInvitation(r.invitation, later(6)));
  assert.equal(r.invitation.by, kiko);
  assert.equal(r.store.sent, false);
  assert.equal(confirmInvitation(r.store, me, 'Bruno', machineTag('m'), later(9)).invitation, undefined, 'une seule fois');
  assert.equal(declareInviter(r.store, createPlayerKey().publicKey, 'Autre', me.publicKey), r.store, 'confirmé : plus modifiable');
  assert.equal(declineInviter(r.store), r.store);
  // « Personne » : la question ne revient plus, une déclaration en attente part.
  const no = declineInviter(declareInviter(emptyInvitations(), kiko, 'Kiko', me.publicKey));
  assert.equal(no.declared, undefined);
  assert.equal(inviterAsked(no, T0.toISOString(), later(1)), false);
});

test('côté inviteur : une machine et un joueur comptés une fois, jamais sa propre machine', () => {
  const kiko = createPlayerKey().publicKey;
  const mine = machineTag('machine-kiko');
  let s = emptyInvitations();
  const a = invitee(kiko, 1), b = invitee(kiko, 2);
  let r = receiveInvited(s, a.inv, kiko, mine);
  assert.ok(r.news);
  s = r.store;
  assert.equal(receiveInvited(s, a.inv, kiko, mine).news, false, 'doublon');
  // Un second compte sur la même machine que a : refusé.
  const clone = createPlayerKey();
  assert.equal(receiveInvited(s, signInvitation(clone, 'Clone', kiko, a.inv.machine, later(30)), kiko, mine).news, false, 'même machine');
  // Un compte créé sur la machine de l'inviteur : refusé.
  assert.equal(receiveInvited(s, signInvitation(clone, 'Clone', kiko, mine, later(30)), kiko, mine).news, false, 'ma machine');
  // Pas pour moi : refusé.
  assert.equal(receiveInvited(s, invitee(createPlayerKey().publicKey, 3).inv, kiko, mine).news, false, 'pas pour moi');
  r = receiveInvited(s, b.inv, kiko, mine);
  assert.ok(r.news);
  s = r.store;
  assert.equal(s.received.length, 2);
  assert.equal(forgetInvited(s, new Set([a.key.publicKey])).received.length, 1, 'compte supprimé : ne compte plus');
});

test('carte publique : les attestations voyagent, toute borne recompte, une fausse ne compte pas', () => {
  const kikoKey = createPlayerKey();
  const kiko = setName({ ...newSocialState(T0), key: kikoKey }, 'Kiko')!;
  let store = emptyInvitations();
  for (let i = 1; i <= 3; i++) store = receiveInvited(store, invitee(kikoKey.publicKey, i).inv, kikoKey.publicKey, undefined).store;
  // Une attestation forgée (signée par un autre que la personne invitée) glissée dans la carte.
  const forged = { ...invitee(kikoKey.publicKey, 9).inv, sig: invitee(kikoKey.publicKey, 10).inv.sig };
  const list = [...cardInvites(store), (({ by: _, ...rest }) => rest)(forged)];
  const card = makeCard(kiko, emptyProfiles(), { records: 0, invited: { list, total: list.length } }, later(60));
  const back = verifyCard(JSON.parse(JSON.stringify(card)), later(61));
  assert.ok(back, 'carte vérifiée');
  assert.equal(invitedOf(back.key, back.invited, back.invitedTotal).count, 3, 'la fausse ne compte pas');
  // Une carte sans personne invitée se vérifie comme avant (bornes d'avant).
  const plain = makeCard(kiko, emptyProfiles(), { records: 0 }, later(60));
  assert.equal(plain.invited, undefined);
  assert.ok(verifyCard(JSON.parse(JSON.stringify(plain)), later(61)));
  // Changer le total annoncé casse la signature.
  assert.equal(verifyCard({ ...back, invitedTotal: 99 }, later(61)), undefined);
  // Au-delà des INVITES_IN_CARD jointes, le total annoncé est cru ; en dessous, jamais.
  const many = Array.from({ length: INVITES_IN_CARD }, (_, i) => invitee(kikoKey.publicKey, 100 + i).inv).map(({ by: _, ...rest }) => rest);
  assert.equal(invitedOf(kikoKey.publicKey, many, 34).count, 34);
  assert.equal(invitedOf(kikoKey.publicKey, many.slice(0, 5), 34).count, 5);
});

test('fichier : relu tel qu’écrit, une attestation abîmée laissée de côté', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-invitations-'));
  try {
    const kiko = createPlayerKey().publicKey;
    let s = declareInviter(emptyInvitations(), kiko, 'Kiko', createPlayerKey().publicKey, T0);
    s = receiveInvited(s, invitee(kiko, 1).inv, kiko, undefined).store;
    s = { ...s, received: [...s.received, { ...invitee(kiko, 2).inv, sig: 'abîmée' }] };
    saveInvitations(dir, s);
    const back = loadInvitations(dir, later(60));
    assert.equal(back.declared?.name, 'Kiko');
    assert.equal(back.received.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('niveau : 100 XP par personne invitée, une seule fois, puis 25 XP à chaque palier, hors plafond', () => {
  const at = later(0);
  let r = invitedGains(emptyLevels(), [{ key: 'a'.repeat(64), name: 'Bruno' }], at);
  assert.deepEqual(r.gains.map((g) => [g.kind, g.xp]), [['invited', XP.invited]]);
  assert.equal(r.state.xp, 100);
  assert.equal(invitedGains(r.state, [{ key: 'a'.repeat(64), name: 'Bruno' }], at).gains.length, 0, 'une seule fois');
  r = invitedGains(r.state, [{ key: 'a'.repeat(64), name: 'Bruno', tier: 2 }], at);
  assert.deepEqual(r.gains.map((g) => g.kind), ['invitee-tier', 'invitee-tier'], 'Flippeur puis Habitué');
  assert.equal(r.state.xp, 150);
  // Une personne déjà Flippeur quand on l'apprend : sa confirmation et son palier.
  assert.equal(invitedGains(emptyLevels(), [{ key: 'b'.repeat(64), name: 'Nova', tier: 1 }], at).state.xp, 125);
  // Vraisemblance : les personnes invitées vérifiées élargissent le plafond.
  assert.equal(plausibleXp(0, 3) - plausibleXp(0), 3 * INVITED_XP_MAX);
  const huge = plausibleXp(0) + 2 * INVITED_XP_MAX;
  assert.equal(shownLevel(huge, T0.toISOString(), T0), undefined);
  assert.ok(shownLevel(huge, T0.toISOString(), T0, 2));
});

test('badges : Ambassadeur dès la première personne invitée, puis Rassembleur et Bâtisseur ; les contributions', () => {
  const base = { games: 0, tables: 0, seconds: 0, longestTable: 0, records: 0, championTables: 0 };
  const ids = (f: Partial<typeof base> & Record<string, number>) => evaluateBadges([], { ...base, ...f }, T0).map((b) => b.id);
  assert.ok(ids({ invited: 1 }).includes('ambassador'));
  assert.ok(!ids({ invited: 1 }).includes('gatherer'));
  assert.ok(ids({ invited: 5 }).includes('gatherer'));
  assert.ok(ids({ invited: 20 }).includes('community-builder'));
  assert.ok(ids({ contributions: 1 }).includes('a-voice'));
  assert.ok(ids({ contributions: 10 }).includes('proposer'));
  assert.ok(ids({ ideasShipped: 1 }).includes('idea-shipped'));
  assert.ok(BADGES.filter((b) => b.family === 'community').length === 6);
});

test('contributions : propositions vues à la liste, masquées retirées quand la liste est complète ; un rapport par jour ; « fait » annoncé une fois', () => {
  const p = (id: string, mine: boolean, status: Proposal['status'] = 'new'): Proposal => ({ id, kind: 'feature', title: `Idée ${id}`, text: '', lang: 'fr', votes: 1, status, at: 0, updated: 0, merged: 0, mine });
  let r = noteProposals(emptyContributions(), [p('aaaaaa1', true), p('bbbbbb2', false)]);
  assert.deepEqual(r.contributions.proposals, ['aaaaaa1']);
  r = noteProposals(r.contributions, [p('aaaaaa1', true, 'done'), p('cccccc3', true)]);
  assert.deepEqual(r.shipped.map((x) => x.id), ['aaaaaa1']);
  assert.equal(noteProposals(r.contributions, [p('aaaaaa1', true, 'done'), p('cccccc3', true)]).shipped.length, 0, 'annoncée une fois');
  // Masquée : absente d'une liste complète, elle ne compte plus ; d'une liste tronquée, si.
  assert.deepEqual(noteProposals(r.contributions, [p('aaaaaa1', true, 'done')]).contributions.proposals, ['aaaaaa1']);
  const full = Array.from({ length: PROPOSALS_LIST_MAX }, (_, i) => p(`z${String(i).padStart(6, '0')}`, false));
  assert.equal(noteProposals(r.contributions, full).contributions.proposals.length, 2);
  let c = noteReport(emptyContributions(), new Date(2026, 10, 17, 10));
  c = noteReport(c, new Date(2026, 10, 17, 22));
  c = noteReport(c, new Date(2026, 10, 18, 9));
  assert.equal(contributionsCount(c), 2, 'un rapport par jour');
});

test('réseau : les cartes d’un même message restent sous la limite (256 Ko), même pleines d’attestations', () => {
  const cards = Array.from({ length: 50 }, (_, n) => {
    const key = createPlayerKey();
    const s = setName({ ...newSocialState(T0), key }, `Joueur ${n}`)!;
    const list = Array.from({ length: INVITES_IN_CARD }, (_, i) => invitee(key.publicKey, n * 100 + i).inv).map(({ by: _, ...rest }) => rest);
    return makeCard(s, emptyProfiles(), { records: 0, invited: { list, total: list.length } }, T0);
  });
  const kept = withinBytes(cards);
  assert.ok(kept.length >= 1 && kept.length < cards.length);
  assert.ok(Buffer.byteLength(JSON.stringify({ t: 'cards', cards: kept })) < 256 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(kept)) <= CARDS_BYTES + 2);
});

interface Net {
  state(): { key: { publicKey: string } };
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  publicCard(key: string): PublicCard | undefined;
  invitations(): { received: Invitation[]; sent?: boolean; mine?: Invitation };
  declareInviter(key: string, name: string): void;
  confirmInvitation(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(REPO_ROOT, 'app', 'dist', 'social-net.js')) as { createSocialNet(o: object): Net };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('entre deux bornes qui ne sont pas amies : l’attestation signée hors ligne arrive à l’inviteur, sa carte compte la personne invitée', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-invite-${i}-`)));
  const told: Invitation[] = [];
  const a = netModule.createSocialNet({ dataDir: dirs[0], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, machine: () => machineTag('machine-kiko'), onInvited: (l: Invitation[]) => told.push(...l) });
  const b = netModule.createSocialNet({ dataDir: dirs[1], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, machine: () => machineTag('machine-bruno') });
  try {
    a.rename('Kiko');
    b.rename('Bruno');
    const A = a.state().key.publicKey;
    // Bruno déclare Kiko et finit sa première partie avant d'être relié : l'attestation attend.
    b.declareInviter(A, 'Kiko');
    b.confirmInvitation();
    assert.ok(b.invitations().mine && !b.invitations().sent);
    await Promise.all([a.start(), b.start()]);
    await until('attestation reçue par Kiko', () => a.invitations().received.length === 1);
    assert.equal(a.invitations().received[0]!.me, b.state().key.publicKey);
    assert.equal(told.length, 1, 'annoncée une fois');
    await until('remise notée chez Bruno', () => b.invitations().sent === true);
    await until('carte de Kiko chez Bruno : une personne invitée', () => {
      const card = b.publicCard(A);
      return !!card && invitedOf(A, card.invited, card.invitedTotal).count === 1;
    });
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});

test('vocabulaire : jamais « parrain » ni « filleul » dans un texte de l’interface', () => {
  const hits: string[] = [];
  const scan = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'test' && e.name !== 'node_modules') scan(p);
      } else if (/\.(ts|js)$/.test(e.name)) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bt[n]?\(\s*'([^']*)'/g)) if (/parrain|filleul/i.test(m[1]!)) hits.push(`${path.relative(REPO_ROOT, p)} : ${m[1]}`);
      }
    }
  };
  scan(path.join(REPO_ROOT, 'packages', 'core', 'src'));
  scan(path.join(REPO_ROOT, 'app', 'src'));
  assert.deepEqual(hits, []);
});
