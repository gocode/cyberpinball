// Invariant : le média installé est celui que l'utilisateur a validé. Le 27/10/2026, sur
// les propositions de l'Afficheur large de The Matrix, une liste qui bougeait (fichiers
// reçus des sites, recherche web, aperçus) faisait valider une autre carte que celle
// regardée ; un fichier reçu d'un site pouvait aussi remplacer dans le brouillon un choix
// fait entre-temps. Ces tests rejouent le parcours jusqu'au fichier rangé dans medias\.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { applyOps } from '../fileops';
import { actionIds, anchorOf, followCursor, indexOfId, resolveActivation, type FocusAnchor } from '../focus';
import type { MediaChoice } from '../mediachoices';
import { emptyMediaDraft, pagesSignature, planMediaChanges, type MediaPageEntry } from '../mediaedit';
import { resolveMedia } from '../medias';
import { mediaChoiceKey, type SiteHit } from '../mediasites';
import { infoFileFor, scanTables } from '../tables';

const FOLDER = 'The Matrix (Original 2023)';

function hit(id: string, title: string): SiteHit {
  return { site: 'vpuniverse', id, title, url: `https://vpuniverse.com/files/file/${id}/` } as SiteHit;
}

/** Les propositions de l'Afficheur large telles que l'écran les a montrées (capture du 27/10/2026). */
function proposals(dir: string): MediaChoice[] {
  const put = (name: string, content: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    return file;
  };
  const choice = (c: Partial<MediaChoice> & Pick<MediaChoice, 'id' | 'label'>): MediaChoice => ({ type: 'FullDMD', kind: 'image', source: 'mediadb', detail: '', ...c }) as MediaChoice;
  return [
    choice({ id: 'mediadb:WyxpJ3Wjt3:1k/dmd_video', label: 'The Matrix (Original 2026)', kind: 'video', file: put('dmd.mp4', 'vidéo VPinMediaDB') }),
    choice({ id: 'mediadb:WyxpJ3Wjt3:1k/dmd', label: 'The Matrix (Original 2026)', file: put('dmd.png', 'image VPinMediaDB') }),
    choice({ id: 'vpuniverse:15000', label: 'The Matrix FullDMD', source: 'vpuniverse', site: { hit: hit('15000', 'The Matrix FullDMD'), pack: false } }),
    choice({ id: 'vpuniverse:22480', label: 'The Matrix (Original 2023) Full DMD', source: 'vpuniverse', site: { hit: hit('22480', 'The Matrix (Original 2023) Full DMD'), pack: false } }),
  ];
}

const asActions = (choices: MediaChoice[]) => choices.map((c) => ({ key: mediaChoiceKey(c), label: c.label }));

test('identité : la clé, sinon le libellé unique ; deux libellés pareils n’en ont pas', () => {
  assert.deepEqual(actionIds([{ label: 'Retour' }, { label: 'A' }, { label: 'A' }, { key: 'x', label: 'A' }]), ['label:Retour', undefined, undefined, 'key:x']);
  assert.equal(indexOfId(['key:a', 'key:site:v:1/f.png'], 'key:site:v:1'), 1);
  assert.equal(indexOfId(['key:a'], 'key:b'), -1);
});

test('une carte insérée au-dessus : Start valide celle que le curseur montrait, pas son rang', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-choix-'));
  const before = proposals(dir);
  const screen = {};
  // La vue montre le curseur sur l'image de VPinMediaDB (2ᵉ carte).
  const shown = actionIds(asActions(before));
  const anchor: FocusAnchor = { screen, cursor: 1, id: shown[1] };
  // Un fichier téléchargé dans « Récupérer » arrive en tête de la liste.
  const web = { id: path.join(dir, 'web.mp4'), type: 'FullDMD', kind: 'video', source: 'web', label: 'web.mp4', detail: '', file: path.join(dir, 'web.mp4') } as MediaChoice;
  const after = [web, ...before];
  const ids = actionIds(asActions(after));
  const cursor = followCursor(ids, 1, screen, anchor);
  assert.equal(after[cursor], before[1], 'le curseur suit l’image, il ne tombe pas sur la vidéo');
  // Le rang seul aurait validé la vidéo : c'est le défaut corrigé.
  assert.notEqual(after[1], before[1]);
  // Un clic parti de l'ancienne vue vaut pour l'élément cliqué, où qu'il soit.
  assert.equal(after[resolveActivation(ids, 1, shown[1])!], before[1]);
  // Disparu entre-temps : rien n'est lancé.
  assert.equal(resolveActivation(actionIds(asActions(before.slice(2))), 1, shown[1]), undefined);
  // Un autre écran, ou un curseur déplacé exprès : obéi.
  assert.equal(followCursor(ids, 1, {}, anchor), 1);
  assert.equal(followCursor(ids, 3, screen, anchor), 3);
});

test('un écran qui se charge : le curseur ne suit pas la seule action montrée le temps du chargement (Bibliothèque de ROM, 29/10/2026)', () => {
  const screen = {};
  // Inventaire en cours : l'écran n'a que son retour.
  const loading = actionIds([{ label: 'Retour au menu' }]);
  const anchor = anchorOf(screen, 0, loading, true);
  const loaded = actionIds([{ label: 'Ranger les ROM dans la bibliothèque' }, { label: 'Ajouter' }, { label: 'Actualiser' }, { label: 'Retour au menu' }]);
  assert.equal(followCursor(loaded, 0, screen, anchor), 0, 'la première action, pas le retour');
  // Hors chargement, l'élément montré est suivi comme avant.
  assert.equal(followCursor(loaded, 0, screen, anchorOf(screen, 0, loading, false)), 3);
});

test('une fiche reçue devient ses fichiers : le curseur reste sur ce qu’elle a donné', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-choix-'));
  const before = proposals(dir);
  const screen = {};
  const shown = actionIds(asActions(before));
  const anchor: FocusAnchor = { screen, cursor: 3, id: shown[3] };
  const got = path.join(dir, 'The Matrix (Original 2023).png');
  fs.writeFileSync(got, 'image MasonStorm');
  // La fiche du dessus (15000) reçue avec deux fichiers : tout ce qui suit descend d'un rang.
  const a = { ...before[2]!, id: path.join(dir, 'a.png'), file: path.join(dir, 'a.png'), site: { ...before[2]!.site!, received: true } };
  const b = { ...a, id: path.join(dir, 'b.mp4'), file: path.join(dir, 'b.mp4') };
  const received = { ...before[3]!, id: got, file: got, label: path.basename(got), site: { ...before[3]!.site!, received: true } };
  const after = [before[0]!, before[1]!, a, b, received];
  const cursor = followCursor(actionIds(asActions(after)), 3, screen, anchor);
  assert.equal(after[cursor], received);
});

test('le fichier rangé dans medias\\ est celui validé, et le menu le montre', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-choix-'));
  const folder = path.join(root, 'tables', FOLDER);
  const medias = path.join(folder, 'medias');
  const offers = path.join(root, 'offres');
  fs.mkdirSync(medias, { recursive: true });
  fs.mkdirSync(offers, { recursive: true });
  fs.writeFileSync(path.join(folder, 'VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx'), '');
  fs.writeFileSync(path.join(folder, `${FOLDER}.info`), JSON.stringify({ Info: { Title: 'The Matrix', Manufacturer: 'Original', Year: 2023, VPSId: 'OUvOEgWRhf' } }));
  // Rangée d'office à l'ajout de la table : la vidéo de VPinMediaDB.
  const auto = path.join(medias, `(FullDMD) ${FOLDER}.mp4`);
  fs.writeFileSync(auto, 'vidéo VPinMediaDB');
  const table = scanTables(path.join(root, 'tables'))[0]!;
  const list = proposals(offers);
  const screen = {};
  const shown = actionIds(asActions(list));
  // L'utilisateur valide l'image (2ᵉ carte), pendant qu'une carte s'insère en tête.
  const web = { id: path.join(offers, 'web.mp4'), type: 'FullDMD', kind: 'video', source: 'web', label: 'web.mp4', detail: '', file: path.join(offers, 'web.mp4') } as MediaChoice;
  const now = [web, ...list];
  const chosen = now[followCursor(actionIds(asActions(now)), 1, screen, { screen, cursor: 1, id: shown[1] })]!;
  const entry: MediaPageEntry = { from: chosen.file!, mode: 'copy' };
  const draft = { ...emptyMediaDraft(), pages: { FullDMD: [entry] } };
  const plan = planMediaChanges(table, draft, { infoFile: infoFileFor(table, path.join(root, 'tables')), current: { FullDMD: [auto] } });
  assert.deepEqual(plan.problems, []);
  applyOps(plan.ops, { trashDir: path.join(root, 'corbeille') });
  const placed = path.join(medias, `(FullDMD) ${FOLDER}.png`);
  assert.equal(fs.readFileSync(placed, 'utf8'), 'image VPinMediaDB', 'le fichier rangé est celui validé');
  assert.equal(fs.existsSync(auto), false, 'la vidéo rangée d’office ne passe plus devant');
  const shownNow = resolveMedia(scanTables(path.join(root, 'tables'))[0]!, root, 'FullDMD');
  assert.equal(path.basename(shownNow.file ?? ''), path.basename(placed), 'le menu montre le fichier validé');
});

test('un fichier attendu d’un site n’écrase pas un choix fait depuis', () => {
  const requested: MediaPageEntry[] = [{ file: 'D:\\t\\medias\\(FullDMD) T.mp4' }];
  const signature = pagesSignature(requested);
  // Rien n'a bougé : le fichier reçu peut entrer dans le brouillon.
  assert.equal(pagesSignature([{ file: 'd:\\T\\MEDIAS\\(FullDMD) T.mp4' }]), signature);
  // Un fichier pris ailleurs (import, ce PC, proposition VPinMediaDB, recherche web), ou le média retiré : il l'emporte.
  assert.notEqual(pagesSignature([{ from: 'D:\\import\\dmd.png', mode: 'move' }]), signature);
  assert.notEqual(pagesSignature([{ from: 'D:\\stage\\a.png', mode: 'move', origin: { origin: 'VPinMediaDB', url: 'https://x/dmd.png' } }]), pagesSignature([{ from: 'D:\\stage\\a.png', mode: 'move', origin: { origin: 'VPinMediaDB', url: 'https://x/dmd.mp4' } }]));
  assert.notEqual(pagesSignature([]), signature);
});
