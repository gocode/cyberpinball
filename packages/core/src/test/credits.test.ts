// Crédits de la communauté (credits.ts) : provenance des pièces dans le .info, auteurs de la table du
// plus sûr au moins sûr, groupes de la page « Crédits », ligne de la roue et du mode attente,
// classement des auteurs d'une borne. Données inventées sur le modèle de la base VPS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTableSource } from '../acquisition';
import {
  attractCredits,
  communityAuthors,
  creditsSummary,
  creditSite,
  creditText,
  leadAuthor,
  namesLabel,
  partSourcesFrom,
  partSourcesOf,
  setPartSources,
  splitAuthors,
  tableAuthors,
  tableCredits,
  type TableCreditsInput,
} from '../credits';
import { setLanguage } from '../i18n';
import type { VpsGame } from '../vps';

const GAME: VpsGame = {
  id: 'game1',
  name: 'Retour Express',
  manufacturer: 'Data West',
  year: 1990,
  designers: ['Ada Plunger', 'Bob Tilt'],
  tableFiles: [
    { id: 'mod', authors: ['Modder', 'Alice'], version: '2.3', comment: 'Big MOD', urls: [{ url: 'https://www.vpforums.org/index.php?showfile=1' }] },
    { id: 'main', authors: ['Alice', 'Bruno', 'Chloé', 'David', 'Eve'], version: '1.05', urls: [{ url: 'https://vpuniverse.com/files/file/1-retour/' }] },
  ],
  b2sFiles: [
    { id: 'b1', authors: ['Haunt'], version: '1.0.0', comment: 'Full DMD', urls: [{ url: 'https://vpuniverse.com/files/file/2-b2s/' }] },
    { id: 'b2', authors: ['Wild'], version: '3.0' },
  ],
  altColorFiles: [{ id: 'c1', authors: ['Enth'], version: '1.0.0', urls: [{ url: 'https://vpuniverse.com/files/file/3-serum/' }] }],
};

const BASE: TableCreditsInput = { game: GAME, parts: {}, present: {}, medias: [], rules: [] };

test('crédits : noms abrégés, accord du reste, sites reconnus', () => {
  setLanguage('fr');
  assert.equal(namesLabel(['A']), 'A');
  assert.equal(namesLabel(['A', 'B']), 'A et B');
  assert.equal(namesLabel(['A', 'B', 'C', 'D']), 'A, B, C et D', 'un seul de plus : on le nomme plutôt que « et 1 autre »');
  assert.equal(namesLabel(['A', 'B', 'C', 'D', 'E']), 'A, B, C et 2 autres');
  assert.equal(namesLabel(['A', 'B', 'C'], 1), 'A et 2 autres');
  assert.equal(creditSite('https://www.vpforums.org/index.php?app=downloads'), 'VPForums');
  assert.equal(creditSite('https://vpuniverse.com/files/file/1/'), 'VPUniverse');
  assert.equal(creditSite('https://pinballnirvana.com/forums/x'), 'pinballnirvana.com');
  assert.equal(creditSite('pas une adresse'), undefined);
  assert.deepEqual(splitAuthors('JPSalas, Rothbauerw & others'), ['JPSalas', 'Rothbauerw']);
  assert.deepEqual(splitAuthors('g5k / VPW'), ['g5k', 'VPW']);
  setLanguage('en');
  assert.equal(namesLabel(['A', 'B', 'C', 'D', 'E']), 'A, B, C and 2 more');
  setLanguage('fr');
});

test('crédits : la provenance des pièces se lit et s’écrit dans le .info sans toucher au reste', () => {
  const info = { Info: { Title: 'Retour Express' }, CyberPinball: { medias: { volume: 80 } } };
  const items = [
    { kind: 'table' as const, fileId: 'main', version: '1.05', authors: ['Alice'] },
    { kind: 'b2s' as const, fileId: 'b1', page: 'https://vpuniverse.com/files/file/2-b2s/' },
    { kind: 'rom' as const, fileId: 'r1' },
    { kind: 'altcolor' as const, fileId: 'recu-altcolor' },
  ];
  const parts = partSourcesFrom(items, GAME, new Date('2026-11-12T10:00:00Z'));
  assert.deepEqual(Object.keys(parts).sort(), ['altcolor', 'b2s'], 'ni la table (TableSource) ni la ROM (le fabricant)');
  assert.deepEqual(parts.b2s?.authors, ['Haunt'], 'auteurs repris de la base quand l’élément ne les a pas');
  assert.equal(parts.b2s?.comment, 'Full DMD');
  assert.equal(parts.altcolor?.vpsFileId, undefined, 'un fichier reçu hors catalogue n’a pas d’identifiant VPS');
  const next = setPartSources(info, parts);
  assert.deepEqual((next.CyberPinball as { medias: unknown }).medias, { volume: 80 });
  assert.deepEqual(partSourcesOf(next).b2s?.authors, ['Haunt']);
  // Une pièce remplacée prend la place de l'ancienne ; les autres restent.
  const again = setPartSources(next, { b2s: { installedAt: '2026-11-13T00:00:00Z', authors: ['Wild'] } });
  assert.deepEqual(partSourcesOf(again).b2s?.authors, ['Wild']);
  assert.ok(partSourcesOf(again).altcolor);
  // Entrées mal formées ignorées.
  assert.deepEqual(partSourcesOf({ CyberPinball: { parts: { b2s: 'oui', rom: { installedAt: 'x' }, pup: { authors: ['X'] } } } }), {});
});

test('crédits : les auteurs de la table, du plus sûr au moins sûr', () => {
  const installed = setTableSource({}, { origin: 'VPS', vpsGameId: 'game1', vpsFileId: 'main', version: '1.05', authors: ['Alice', 'Bruno'], installedAt: 'x' });
  const fromSource = tableAuthors({ game: GAME, source: { origin: 'VPS', vpsGameId: 'game1', vpsFileId: 'main', version: '1.05', authors: ['Alice', 'Bruno'], installedAt: 'x' } });
  assert.equal(fromSource.from, 'installed');
  assert.equal(fromSource.url, 'https://vpuniverse.com/files/file/1-retour/', 'la page du fichier VPS quand la provenance n’en a pas');
  // Reconnue d'après l'auteur et la version écrits dans la table : la liste complète de VPS.
  const recognized = tableAuthors({ game: GAME, vpxAuthor: 'Alice & others', vpxVersion: '1.05' });
  assert.equal(recognized.from, 'recognized');
  assert.equal(recognized.authors.length, 5);
  // L'auteur seul, présent dans deux recréations : pas de choix au hasard.
  const ambiguous = tableAuthors({ game: GAME, vpxAuthor: 'Alice' });
  assert.equal(ambiguous.from, 'table');
  assert.deepEqual(ambiguous.authors, ['Alice']);
  assert.equal(tableAuthors({ game: GAME, infoAuthors: ['Zed'] }).from, 'info');
  assert.equal(tableAuthors({}).from, 'unknown');
  // La roue : l'auteur principal.
  assert.equal(leadAuthor(installed), 'Alice');
  assert.equal(leadAuthor({ Info: { Authors: ['  ', 'Zed'] } }), 'Zed');
  assert.equal(leadAuthor({}, 'g5k / VPW'), 'g5k');
  assert.equal(leadAuthor({}), undefined);
});

test('crédits : la page, de la vraie machine aux règles ; une pièce inconnue reste dite', () => {
  setLanguage('fr');
  const groups = tableCredits({
    ...BASE,
    rom: 'rx_a28',
    vpxAuthor: 'Alice',
    vpxVersion: '1.05',
    parts: { b2s: { installedAt: 'x', authors: ['Haunt'], version: '1.0.0', comment: 'Full DMD', page: 'https://vpuniverse.com/files/file/2-b2s/' } },
    present: { b2s: true, altsound: true },
    medias: [
      { label: 'Logo de la roue', origin: 'VPinMediaDB', detail: 'téléchargé le 21/10/2026' },
      { label: 'Vidéo du plateau', origin: 'Filmée sur cette borne', own: true },
    ],
    rules: [{ kind: 'video', label: 'Vidéo d’explication', authors: ['Prof Flipper'], url: 'https://www.youtube.com/watch?v=x' }],
  });
  assert.deepEqual(groups.map((g) => g.id), ['machine', 'table', 'dressing', 'menu', 'rules']);
  const [machine, table, dressing, menu, rules] = groups;
  assert.deepEqual(machine!.rows[0]!.authors, ['Ada Plunger', 'Bob Tilt']);
  assert.match(machine!.rows[1]!.detail!, /rx_a28/);
  assert.equal(table!.rows[0]!.detail, 'version 1.05 · VPUniverse');
  assert.equal(creditText(table!.rows[0]!), 'Alice, Bruno, Chloé et 2 autres');
  assert.equal(dressing!.rows[0]!.detail, 'Full DMD · version 1.0.0 · VPUniverse');
  const sound = dressing!.rows.find((r) => r.kind === 'altsound')!;
  assert.deepEqual(sound.authors, []);
  assert.match(sound.unknown!, /avant que Cyber Pinball note les auteurs/);
  assert.equal(creditText(sound), 'Auteur non renseigné');
  assert.equal(creditText(menu!.rows[0]!), 'VPinMediaDB');
  assert.match(menu!.rows[0]!.detail!, /auteur non renseigné/);
  assert.equal(creditText(menu!.rows[1]!), 'Filmée sur cette borne');
  assert.equal(rules!.rows[0]!.kind, 'video');
  // Résumé de la fiche et ligne du mode attente.
  assert.equal(creditsSummary(groups), 'Table de Alice, Bruno et 3 autres · fronton de Haunt');
  assert.deepEqual(attractCredits(groups), [
    { role: 'Table', names: 'Alice, Bruno et 3 autres' },
    { role: 'Fronton', names: 'Haunt' },
  ]);
  // Une pièce notée puis retirée du dossier n'est plus créditée ; sans savoir (lecture rapide), elle l'est.
  const removed = tableCredits({ ...BASE, parts: { b2s: { installedAt: 'x', authors: ['Haunt'] } }, present: { b2s: false } });
  assert.equal(removed.find((g) => g.id === 'dressing'), undefined);
  const unknownPresence = tableCredits({ ...BASE, parts: { b2s: { installedAt: 'x', authors: ['Haunt'] } }, present: {} });
  assert.deepEqual(unknownPresence.find((g) => g.id === 'dressing')?.rows[0]?.authors, ['Haunt']);
  // Rien de connu : la table reste, inconnue ; pas de groupe vide.
  const bare = tableCredits({ parts: {}, present: {}, medias: [], rules: [] });
  assert.deepEqual(bare.map((g) => g.id), ['table']);
  assert.match(bare[0]!.rows[0]!.unknown!, /Ni la table ni la base VPS/);
  assert.equal(attractCredits(bare).length, 0);
  assert.match(creditsSummary(bare), /Qui a fait la table/);
});

test('crédits : la communauté, des plus présents aux moins présents, sans la vraie machine', () => {
  setLanguage('fr');
  const a = tableCredits({ ...BASE, source: { origin: 'VPS', vpsGameId: 'game1', vpsFileId: 'main', authors: ['Alice', 'Bruno'], installedAt: 'x' }, parts: { b2s: { installedAt: 'x', authors: ['Haunt'] } } });
  const b = tableCredits({ ...BASE, game: undefined, infoAuthors: ['alice'], parts: { b2s: { installedAt: 'x', authors: ['Haunt'] }, altcolor: { installedAt: 'x', authors: ['Haunt'] } } });
  const ranked = communityAuthors([
    { title: 'Retour Express', groups: a },
    { title: 'Autre', groups: b },
  ]);
  assert.deepEqual(
    ranked.map((r) => [r.name, r.count]),
    [
      ['Haunt', 3],
      ['Alice', 2],
      ['Bruno', 1],
    ],
    '« alice » et « Alice » sont la même personne ; les concepteurs de la machine ne comptent pas',
  );
  assert.equal(ranked[0]!.roles, '2 frontons · 1 colorisation');
  assert.deepEqual(ranked[0]!.tables, ['Autre', 'Retour Express']);
});
