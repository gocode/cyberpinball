// Retours des joueurs (feedback.ts) : ce que la borne fixe de son côté du protocole.
// - un rapport scellé ne s'ouvre qu'avec la clé « retours » ; personne d'autre, pas même le service,
//   ne lit son enveloppe ni son fichier ;
// - la clé publique de scellement du dépôt est bien celle d'une clé X25519, celle de gestion une Ed25519 ;
// - une requête signée par la borne se vérifie avec sa clé publique sur le préfixe du protocole ;
// - les propositions venues du service sont relues champ par champ, triées par votes ;
// - les doublons : une proposition proche est retrouvée malgré accents, majuscules et pluriels ;
// - les plantages automatiques : rien sans accord, puis une fois par jour au plus pour un même plantage.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  cleanProposalText,
  cleanProposalTitle,
  createPlayerKey,
  crashDue,
  FEEDBACK_KEYS,
  FEEDBACK_PREFIX,
  loadFeedbackState,
  noteCrashSent,
  openSealedReport,
  parseFeedbackPerson,
  parseProposals,
  parseSupporters,
  saveFeedbackState,
  sealReport,
  signFeedback,
  similarProposals,
  verifyText,
  type Proposal,
  type ReportEnvelope,
} from '../index';

const envelope: ReportEnvelope = { v: 1, kind: 'report', text: 'Le DMD reste noir', version: '0.1.13', lang: 'fr', borne: 'AbCdEfGhIjKl', at: 1 };

function x25519Pair(): { publicHex: string; privatePem: string } {
  const pair = crypto.generateKeyPairSync('x25519');
  return { publicHex: Buffer.from(pair.publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('hex'), privatePem: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() };
}

test('un rapport scellé ne s’ouvre qu’avec sa clé', () => {
  const team = x25519Pair();
  const other = x25519Pair();
  const zip = crypto.randomBytes(5000);
  const sealed = sealReport(envelope, zip, team.publicHex);
  assert.equal(sealed.subarray(0, 4).toString('ascii'), 'CPR1');
  assert.ok(!sealed.includes(Buffer.from('DMD reste noir')), 'le texte ne paraît pas en clair');
  const opened = openSealedReport(sealed, team.privatePem);
  assert.deepEqual(opened?.envelope, envelope);
  assert.ok(opened?.file?.equals(zip));
  assert.equal(openSealedReport(sealed, other.privatePem), undefined);
  // Un octet changé : refusé (AES-GCM authentifié).
  const bad = Buffer.from(sealed);
  bad[bad.length - 1]! ^= 1;
  assert.equal(openSealedReport(bad, team.privatePem), undefined);
  // Sans fichier : l'enveloppe seule.
  assert.equal(openSealedReport(sealReport(envelope, undefined, team.publicHex), team.privatePem)?.file, undefined);
});

test('les clés « retours » du dépôt sont de la bonne sorte', () => {
  assert.doesNotThrow(() => crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(FEEDBACK_KEYS.seal, 'hex').toString('base64url') }, format: 'jwk' }));
  assert.doesNotThrow(() => crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(FEEDBACK_KEYS.sign, 'hex').toString('base64url') }, format: 'jwk' }));
  assert.ok(sealReport(envelope, undefined).length > 64);
});

test('une requête de la borne est signée sur le préfixe du protocole', () => {
  const key = createPlayerKey();
  const body = signFeedback(key, { op: 'vote', id: 'abcdefghij', on: true }, 1234);
  const b = JSON.parse(body.b) as Record<string, unknown>;
  assert.deepEqual(b, { v: 1, op: 'vote', id: 'abcdefghij', on: true, pk: key.publicKey, t: 1234 });
  assert.ok(verifyText(FEEDBACK_PREFIX + body.b, body.s, key.publicKey));
  assert.ok(!verifyText(body.b, body.s, key.publicKey));
});

test('titres et descriptions nettoyés', () => {
  assert.equal(cleanProposalTitle('  Trier   les tables\tpar fabricant '), 'Trier les tables par fabricant');
  assert.equal(cleanProposalTitle('abc'), undefined);
  assert.equal(cleanProposalTitle('x'.repeat(91)), undefined);
  assert.equal(cleanProposalText('a\r\nb\n\n\n\nc\u0007'), 'a\nb\n\nc');
  assert.equal(cleanProposalText('x'.repeat(2001)), undefined);
});

const p = (id: string, title: string, votes: number, extra: Partial<Proposal> = {}): Record<string, unknown> => ({ id, kind: 'feature', title, text: '', lang: 'fr', votes, status: 'new', at: votes, updated: votes, merged: 0, ...extra });

test('les propositions du service sont relues et triées par votes', () => {
  const list = parseProposals({
    propositions: [p('aaaaaaaa', 'Classement par fabricant', 3), p('bbbbbbbb', 'Mode nuit pour la roue', 12, { voted: true, author: 'x' } as unknown as Partial<Proposal>), { id: '../etc', title: 'Mauvaise', kind: 'feature', status: 'new' }, p('cccccccc', 'Statut inconnu', 5, { status: 'zzz' as Proposal['status'] })],
  });
  assert.deepEqual(list.map((x) => x.id), ['bbbbbbbb', 'aaaaaaaa']);
  assert.equal(list[0]!.voted, true);
  assert.ok(!('author' in list[0]!), 'rien d’inattendu n’entre');
});

// Auteur et soutiens (18/11/2026) : le service nomme les joueurs par leur pseudo signé ; un pseudo
// invalide ou un pays mal formé n'entre pas dans les écrans, et un soutien sans nom se compte.
test('auteur et soutiens : pseudo et pays vérifiés, les invalides se comptent sans nom', () => {
  const [good, noCountry, bad] = parseProposals({
    propositions: [
      p('aaaaaaaa', 'Classement par fabricant', 3, { author: { name: '  Bruno ', country: 'FR' } }),
      p('bbbbbbbb', 'Mode nuit pour la roue', 2, { author: { name: 'Dora', country: 'france' } } as unknown as Partial<Proposal>),
      p('cccccccc', 'Écran du DMD trop sombre', 1, { author: { name: '<script>' } } as unknown as Partial<Proposal>),
    ],
  });
  assert.deepEqual(good!.author, { name: 'Bruno', country: 'FR' });
  assert.deepEqual(noCountry!.author, { name: 'Dora' });
  assert.ok(!('author' in bad!));
  assert.deepEqual(parseSupporters({ soutiens: [{ name: 'Kiko', country: 'BE' }, { name: '' }, 'x', { name: 'Vortex' }], autres: 3 }), {
    people: [{ name: 'Kiko', country: 'BE' }, { name: 'Vortex' }],
    others: 5,
  });
  assert.equal(parseSupporters({ autres: 2 }), undefined);
  assert.deepEqual(parseFeedbackPerson({ name: 'Tiltman', country: 'CA' }), { name: 'Tiltman', country: 'CA' });
});

test('les doublons sont retrouvés malgré accents, majuscules et pluriels', () => {
  const list = parseProposals({ propositions: [p('aaaaaaaa', 'Trier les tables par fabricant', 3), p('bbbbbbbb', 'Mode nuit pour la roue', 12), p('cccccccc', 'Écran du DMD trop sombre', 1)] });
  assert.deepEqual(similarProposals('TABLE triée par Fabricants', list).map((x) => x.id), ['aaaaaaaa']);
  assert.deepEqual(similarProposals('dmd ecran sombre', list).map((x) => x.id), ['cccccccc']);
  assert.deepEqual(similarProposals('Ajouter le support des manettes Xbox', list), []);
});

test('plantages automatiques : rien sans accord, puis une fois par jour', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retours-'));
  try {
    let s = loadFeedbackState(dir);
    assert.equal(s.crashes, 'ask');
    assert.match(s.borne, /^[A-Za-z0-9_-]{8,32}$/);
    assert.equal(crashDue(s, 'vpx:0xC0000005:x', 0), false);
    s = { ...s, crashes: 'yes' };
    assert.equal(crashDue(s, 'vpx:0xC0000005:x', 1000), true);
    s = noteCrashSent(s, 'vpx:0xC0000005:x', 1000);
    assert.equal(crashDue(s, 'vpx:0xC0000005:x', 1000 + 3600_000), false);
    assert.equal(crashDue(s, 'vpx:0xC0000005:y', 1000 + 3600_000), true);
    assert.equal(crashDue(s, 'vpx:0xC0000005:x', 1000 + 25 * 3600_000), true);
    saveFeedbackState(dir, s);
    const back = loadFeedbackState(dir);
    assert.equal(back.crashes, 'yes');
    assert.equal(back.borne, s.borne);
    s = { ...back, crashes: 'no' };
    assert.equal(crashDue(s, 'vpx:autre:z', 0), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('un seul mot commun ne fait pas un doublon', () => {
  const list = parseProposals({ propositions: [p('aaaaaaaa', 'Mode attente : alterner les vidéos des tables favorites', 8)] });
  assert.deepEqual(similarProposals('Trier les tables par fabricant', list), []);
  assert.deepEqual(similarProposals('Vidéos des tables favorites', list).map((x) => x.id), ['aaaaaaaa']);
});
