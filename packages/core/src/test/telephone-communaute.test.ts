// Communauté au téléphone, lot « Joueurs et profils » (18/11/2026) : les messages du téléphone (ouvrir
// un profil, y agir, répondre à une demande d'ami) bornés par le cœur ; le profil d'un joueur pour la
// page (app/src/phone-community.ts, compilé) tiré de l'écran de la borne, une seule source ; ses
// actions retrouvées par leur identité, jamais par un rang ; bloquer et retirer de mes amis faits sans
// rouvrir la confirmation de la borne (le téléphone a déjà demandé). Le parcours de bout en bout, dans
// la vraie page hors écran : telecommande.test.ts (scénario des classements et de la Communauté).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { parsePhoneMessage } from '../remote';
import { REPO_ROOT } from './i18n-scan';
import { fakeSocialNet } from './doublures';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
const ME = 'a'.repeat(64);
const KIKO = 'b'.repeat(64);
const LENA = 'c'.repeat(64);

test('téléphone, Joueurs : profile-open, profile-act et friend-answer bornés par le cœur', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'profile-open', s: 3, key: KIKO }), { t: 'profile-open', s: 3, key: KIKO });
  assert.deepEqual(parsePhoneMessage({ t: 'profile-open', s: 3 }), { t: 'profile-open', s: 3 }, 'sans clé : le profil est refermé');
  assert.equal(parsePhoneMessage({ t: 'profile-open', s: 3, key: 'g:0123456789abcdef' }), undefined, 'un groupe n’est pas un joueur');
  assert.equal(parsePhoneMessage({ t: 'profile-open', s: 3, key: 'C:\\x' }), undefined);
  assert.deepEqual(parsePhoneMessage({ t: 'profile-act', s: 4, key: KIKO, a: 'like:0123' }), { t: 'profile-act', s: 4, key: KIKO, a: 'like:0123' });
  assert.equal(parsePhoneMessage({ t: 'profile-act', s: 4, key: KIKO, a: '' }), undefined);
  assert.equal(parsePhoneMessage({ t: 'profile-act', s: 4, key: KIKO, a: 'x'.repeat(201) }), undefined);
  assert.equal(parsePhoneMessage({ t: 'profile-act', s: 4, key: KIKO, a: 'like\n1' }), undefined, 'jamais un caractère de contrôle');
  assert.equal(parsePhoneMessage({ t: 'profile-act', s: 4, key: KIKO, a: 3 }), undefined, 'une identité, jamais un rang');
  assert.deepEqual(parsePhoneMessage({ t: 'friend-answer', s: 5, key: LENA, yes: false }), { t: 'friend-answer', s: 5, key: LENA, yes: false });
  assert.equal(parsePhoneMessage({ t: 'friend-answer', s: 5, key: LENA, yes: 'oui' }), undefined);
});

interface Action {
  label: string;
  key?: string;
  detail?: string;
  tone?: string;
  icon?: string;
  run: () => void;
}

/* eslint-disable @typescript-eslint/no-require-imports */
interface RemoteProfile {
  name: string;
  subheading: string;
  flag?: string;
  flash?: { text: string; tone?: string };
  rows: { text: string }[];
  level?: { text: string; detail?: string; progress?: number };
  badges?: { medals: { icon: string; rarity: string; label: string }[] };
  activity?: { rows: { text: string; act?: string }[] };
  groups?: { text: string; detail?: string; act: string }[];
  notes: string[];
  actions: { act: string; label: string; detail?: string; quiet?: boolean; primary?: boolean; where: string }[];
}
interface PhoneCommunity {
  profile(key: string): RemoteProfile | undefined;
  act(key: string, act: string): void;
  answer(key: string, yes: boolean): void;
}
const { createPhoneCommunity } = require(path.join(APP_DIST, 'phone-community.js')) as { createPhoneCommunity(host: object): PhoneCommunity };

/** Un profil tel que la borne le dessine (profile-menu.ts, buildProfile), réduit à ses rôles de sections. */
function fixture(opts: { friend: boolean; flash?: boolean }) {
  const ran: string[] = [];
  const refreshes: number[] = [];
  const blocked: string[] = [];
  const removed: string[] = [];
  const answers: string[] = [];
  const likes: Record<string, number> = { e1: 3 };
  const run = (id: string) => () => void ran.push(id);
  const built = () => {
    const actions: Action[] = [];
    const like = actions.push({ label: 'Record sur Neon Abyss', key: 'like:e1', icon: 'star', run: run('like:e1') }) - 1;
    const group = actions.push({ label: 'Club Bally', key: 'group:0123456789abcdef', icon: 'group', run: run('group') }) - 1;
    actions.push(
      ...(opts.friend
        ? [
            { label: 'Inviter à une partie en direct', key: 'invite', run: run('invite') },
            { label: 'Voir sa bibliothèque', key: 'library', run: run('library') },
          ]
        : [{ label: 'Envoyer une demande d’ami', key: 'request', tone: 'ok', run: run('request') }]),
      opts.friend ? { label: 'Écrire un message', key: 'write', run: run('write') } : { label: 'Écrire un message', key: 'write', tone: 'quiet', detail: 'Indisponible : entre amis seulement', run: run('write') },
      { label: 'Masquer son activité', key: 'activity', run: run('activity') },
      ...(opts.friend ? [{ label: 'Retirer de mes amis', key: 'unfriend', run: run('unfriend-borne') }] : []),
      { label: 'Bloquer Kiko', key: 'block', run: run('block-borne') },
      { label: 'Retour', key: 'back', run: run('back') },
    );
    return {
      heading: 'Kiko',
      avatar: { initials: 'K', hue: 40, level: 12 },
      subheading: 'Expert · niveau 12 · Votre ami',
      sections: [
        ...(opts.flash ? [{ rows: [{ text: 'Demande envoyée à Kiko', tone: 'ok' }] }] : []),
        { kind: 'profile-head', rows: [{ text: 'En ligne', detail: 'Amis depuis le 3/11', tone: 'ok', icon: 'friend-list' }] },
        { kind: 'profile-level', rows: [{ text: 'Expert · niveau 12', detail: '340 / 500 XP', progress: { value: 0.68, tone: 'ok' } }] },
        { kind: 'profile-badges', title: 'Badges', rows: [{ text: '7 badges sur 56', medals: [{ icon: 'coin', rarity: 'rare', label: 'Cent parties', xp: 30 }] }] },
        { kind: 'profile-groups', title: 'Groupes publics', rows: [{ text: 'Club Bally', detail: '23 membres', action: group }] },
        { kind: 'profile-activity', title: 'Activité récente', rows: [{ text: 'Record sur Neon Abyss', detail: 'hier', icon: 'trophy', action: like }, { text: 'A joué avec vous', icon: 'play', tone: 'quiet' }] },
        { kind: 'profile-note', rows: [{ text: 'Table en cours, parties jouées, bibliothèque : réservées à ses amis', tone: 'quiet' }] },
      ],
      actions,
      back: () => undefined,
    };
  };
  const phone = createPhoneCommunity({
    profiles: { remote: () => built() },
    net: fakeSocialNet({
      publicCard: () => ({ country: 'FR', likes }),
      likedByMe: (_key: string, id: string) => id === 'e1',
      remove: (key: string) => void removed.push(key),
      accept: (key: string) => void answers.push(`oui:${key}`),
      decline: (key: string) => void answers.push(`non:${key}`),
      state: () => ({ key: { publicKey: ME }, friends: opts.friend ? [{ key: KIKO }] : [], incoming: [{ key: LENA }] }),
    }),
    block: (key: string) => void blocked.push(key),
    refresh: () => void refreshes.push(1),
  });
  return { phone, ran, refreshes, blocked, removed, answers };
}

test('téléphone, profil : celui de la borne, rangé pour la page (en-tête, niveau, badges officiels, activité, groupes)', () => {
  const { phone } = fixture({ friend: false, flash: true });
  const p = phone.profile(KIKO)!;
  assert.equal(p.name, 'Kiko');
  assert.equal(p.subheading, 'Expert · niveau 12 · Votre ami');
  assert.equal(p.flag, 'drapeaux/fr.svg', 'le drapeau de sa carte, servi par la borne');
  assert.deepEqual(p.flash, { text: 'Demande envoyée à Kiko', tone: 'ok' }, 'le constat de la dernière action en tête');
  assert.deepEqual(p.rows.map((r) => r.text), ['En ligne']);
  assert.deepEqual(p.level, { text: 'Expert · niveau 12', detail: '340 / 500 XP', progress: 0.68 });
  assert.deepEqual(p.badges?.medals, [{ icon: 'coin', rarity: 'rare', label: 'Cent parties' }], 'les badges : icône et rareté, dessinés au téléphone par niveau.js');
  assert.deepEqual(p.activity?.rows[0], { text: 'Record sur Neon Abyss', detail: 'hier', icon: 'trophy', likes: 3, liked: true, act: 'like:e1' }, 'un évènement aimable : ses « J’aime » et l’identité de son action');
  assert.equal(p.activity?.rows[1]?.act, undefined, 'une partie jouée ne s’aime pas');
  assert.deepEqual(p.groups, [{ text: 'Club Bally', detail: '23 membres', act: 'group:0123456789abcdef' }]);
  assert.deepEqual(p.notes, ['Table en cours, parties jouées, bibliothèque : réservées à ses amis']);
  // Les actions : sans Retour, sans les « J'aime » ni les groupes (sur leur ligne) ; ce que fait chacune.
  assert.deepEqual(
    p.actions.map((a) => `${a.act}:${a.where}${a.primary ? ':primaire' : ''}${a.quiet ? ':grisée' : ''}`),
    ['request:here:primaire', 'write:thread:grisée', 'activity:here', 'block:confirm'],
  );
  assert.equal(p.actions.find((a) => a.act === 'write')?.detail, 'Indisponible : entre amis seulement', 'écrire, grisé avec sa raison');
  assert.equal(phone.profile(ME), undefined, 'jamais mon propre profil par ce chemin');
});

test('téléphone, profil d’un ami : écrire en premier ; inviter et sa bibliothèque s’ouvrent à la borne ; retirer se confirme au téléphone', () => {
  const { phone } = fixture({ friend: true });
  const p = phone.profile(KIKO)!;
  assert.deepEqual(
    p.actions.map((a) => `${a.act}:${a.where}${a.primary ? ':primaire' : ''}`),
    ['invite:borne', 'library:borne', 'write:thread:primaire', 'activity:here', 'unfriend:confirm', 'block:confirm'],
  );
});

test('téléphone, profil : une action retrouvée par son identité dans le profil refait ; bloquer et retirer sans la confirmation de la borne', () => {
  const f = fixture({ friend: true });
  f.phone.act(KIKO, 'like:e1');
  f.phone.act(KIKO, 'invite');
  f.phone.act(KIKO, 'back');
  f.phone.act(KIKO, 'inconnue');
  assert.deepEqual(f.ran, ['like:e1', 'invite'], 'Retour et une identité inconnue ne font rien');
  f.phone.act(KIKO, 'block');
  f.phone.act(KIKO, 'unfriend');
  assert.deepEqual(f.blocked, [KIKO], 'bloquer : fait aussitôt (le téléphone a confirmé)');
  assert.deepEqual(f.removed, [KIKO], 'retirer de mes amis : fait aussitôt');
  assert.ok(!f.ran.includes('block-borne') && !f.ran.includes('unfriend-borne'), 'la confirmation de la borne ne s’ouvre pas');
  f.phone.act(ME, 'like:e1');
  assert.equal(f.ran.length, 2, 'rien sur mon propre profil');
  assert.ok(f.refreshes.length >= 4, 'chaque geste redessine le téléphone');
  const g = fixture({ friend: false });
  g.phone.act(KIKO, 'write');
  g.phone.act(KIKO, 'unfriend');
  assert.deepEqual(g.ran, [], 'une action grisée ne part pas');
  assert.deepEqual(g.removed, [], 'retirer un joueur qui n’est pas mon ami : rien');
});

test('téléphone, Joueurs : une réponse à une demande seulement pour une demande reçue', () => {
  const f = fixture({ friend: false });
  f.phone.answer(LENA, true);
  f.phone.answer(KIKO, false);
  assert.deepEqual(f.answers, [`oui:${LENA}`]);
});

test('téléphone, Joueurs : la page reçoit la liste de la borne et le profil, et ne recopie rien', () => {
  const page = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone-community.js'), 'utf8');
  const html = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone.html'), 'utf8');
  const remote = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts'), 'utf8');
  // Les badges officiels : le module de la borne, servi au téléphone et chargé avant la Communauté.
  assert.match(remote, /'\/niveau\.js': 'niveau\.js'/);
  const script = (src: string) => html.indexOf(`<script src="${src}"></script>`);
  assert.ok(script('niveau.js') > -1 && script('niveau.js') < script('telephone-community.js'), 'niveau.js chargé avant la Communauté');
  assert.match(page, /CyberLevels\.badgeSvg\(/, 'les badges du profil sont ceux de la borne');
  assert.doesNotMatch(page, /players:\s*Array\.isArray/, 'plus de liste « Autres joueurs » recopiée à part');
  // Les lignes des joueurs viennent de la borne (community-menu.ts, personDetail), une seule fonction pour les deux.
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'community-menu.ts'), 'utf8');
  assert.equal((menu.match(/personDetail\(/g) ?? []).length, 3, 'définie une fois, utilisée à la borne et au téléphone');
});
