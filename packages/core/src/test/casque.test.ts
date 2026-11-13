// Le menu dans le casque (casque.ts) : une borne vue du joueur, chaque écran à sa taille réelle,
// le playfield couché, incliné, le bord des flippers vers le joueur ; la tête de la borne debout.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { CONTROLLER_ELEMENTS, HEADSET_PROFILES } from '../manettes';
import { headsetPanels, headsetProtocol, LOCKBAR_DISTANCE_M, MIN_PLAYFIELD_M, panelSize, rotateVector, STANDARD_HEAD, type HeadsetPanel, type HeadsetSource } from '../casque';
import { edgeRotation } from '../model';

/** Un fichier source, fins de ligne ramenées à LF : le même texte dans un checkout CRLF (core.autocrlf) ou LF. */
function source(...parts: string[]): string {
  return fs.readFileSync(path.join(...parts), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Le bloc entre accolades qui suit `head` (accolades appariées) et le texte qui le suit : une assertion sur
 * « ce qui vient après le bloc » ne dépend ni de sa longueur ni des fins de ligne (une fenêtre de N caractères
 * cassait dès que le bloc grossissait, essai 0.1.9-essai.46).
 */
function blockOf(text: string, head: string): { body: string; after: string } {
  const at = text.indexOf(head);
  assert.ok(at >= 0, `introuvable : ${head}`);
  const open = text.indexOf('{', at + head.length);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { body: text.slice(open, i + 1), after: text.slice(i + 1) };
  }
  throw new Error(`bloc non fermé : ${head}`);
}

const close = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// Borne type : playfield 43" 4K couché, Windows en paysage, flippers au bord gauche de l'image ;
// fronton 32", DMD 15,6".
const sources: HeadsetSource[] = [
  { role: 'playfield', rect: { x: 0, y: 0, width: 3840, height: 2160 }, screenCm: { width: 95, height: 53.5 }, screenPx: { width: 3840, height: 2160 } },
  { role: 'backglass', rect: { x: 3840, y: 0, width: 1920, height: 1080 }, screenCm: { width: 70, height: 39.4 }, screenPx: { width: 1920, height: 1080 } },
  { role: 'dmd', rect: { x: 5760, y: 0, width: 1920, height: 1080 }, screenCm: { width: 34.5, height: 19.4 }, screenPx: { width: 1920, height: 1080 } },
];

/** Direction, dans l'espace de la borne, d'un axe de l'image du panneau (x à droite, y en haut). */
const imageAxis = (p: HeadsetPanel, v: { x: number; y: number; z: number }) => rotateVector(p.orientation, v);

test('chaque panneau a la taille réelle de son écran, ou une largeur par défaut sans EDID', () => {
  const pf = panelSize(sources[0]!);
  close(pf.width, 0.95);
  close(pf.height, 0.535);
  // Zone d'un écran : la part de ses centimètres.
  const half = panelSize({ ...sources[1]!, rect: { x: 3840, y: 540, width: 1920, height: 540 } });
  close(half.width, 0.7);
  close(half.height, 0.197);
  const unknown = panelSize({ role: 'topper', rect: { x: 0, y: 0, width: 1920, height: 480 } });
  close(unknown.width, 0.6);
  close(unknown.height, 0.15);
});

test('le playfield est couché devant le joueur, incliné, le bord des flippers vers lui', () => {
  const panels = headsetPanels(sources, edgeRotation('left'));
  const pf = panels.find((p) => p.role === 'playfield')!;
  // Face vers le haut (légèrement vers le joueur, pente de 6,5°).
  const normal = imageAxis(pf, { x: 0, y: 0, z: 1 });
  assert.ok(normal.y > 0.99 && normal.z > 0.1, JSON.stringify(normal));
  // Bord gauche de l'image (les flippers) : vers le joueur (+z), bord droit vers le fond.
  const left = imageAxis(pf, { x: -1, y: 0, z: 0 });
  assert.ok(left.z > 0.99, JSON.stringify(left));
  // Image tournée d'un quart : la longueur du plateau est la largeur de l'écran, 95 cm, depuis la barre avant.
  close(pf.position.z, -LOCKBAR_DISTANCE_M - (0.95 / 2) * Math.cos((6.5 * Math.PI) / 180));
  assert.ok(pf.position.y > 0.8 && pf.position.y < 0.9);
  // Flippers en bas de l'image (PC de bureau) : le bas vers le joueur.
  const desk = headsetPanels(sources, edgeRotation('bottom')).find((p) => p.role === 'playfield')!;
  assert.ok(imageAxis(desk, { x: 0, y: -1, z: 0 }).z > 0.99);
  const right = headsetPanels(sources, edgeRotation('right')).find((p) => p.role === 'playfield')!;
  assert.ok(imageAxis(right, { x: 1, y: 0, z: 0 }).z > 0.99);
});

test('un petit playfield (poste de bureau) prend la taille d’une borne de 42 pouces, proportions gardées', () => {
  const desk: HeadsetSource = { role: 'playfield', rect: { x: 0, y: 0, width: 1920, height: 1080 }, screenCm: { width: 38, height: 21.4 }, screenPx: { width: 1920, height: 1080 } };
  const pf = headsetPanels([desk], edgeRotation('bottom'))[0]!;
  close(pf.width, MIN_PLAYFIELD_M);
  close(pf.height, (MIN_PLAYFIELD_M * 21.4) / 38);
  // Un grand playfield garde sa taille réelle.
  close(headsetPanels(sources, 90)[0]!.width, 0.95);
});

test('la tête de la borne est debout au bout du plateau : DMD, puis fronton au-dessus, puis topper', () => {
  const withTopper = [...sources, { role: 'topper' as const, rect: { x: 7680, y: 0, width: 1920, height: 480 } }];
  const panels = headsetPanels(withTopper, edgeRotation('left'));
  const by = (role: string) => panels.find((p) => p.role === role)!;
  const pf = by('playfield');
  for (const role of ['dmd', 'backglass', 'topper']) {
    const p = by(role);
    // Face au joueur, image droite.
    close(imageAxis(p, { x: 0, y: 0, z: 1 }).z, 1);
    close(imageAxis(p, { x: 0, y: 1, z: 0 }).y, 1);
    // Plus loin que le plateau.
    assert.ok(p.position.z < pf.position.z - 0.4, role);
  }
  const top = (p: HeadsetPanel) => p.position.y + p.height / 2;
  const bottom = (p: HeadsetPanel) => p.position.y - p.height / 2;
  assert.ok(bottom(by('backglass')) > top(by('dmd')));
  assert.ok(bottom(by('topper')) > top(by('backglass')));
  // Fronton à hauteur des yeux d'un joueur debout, ou presque.
  assert.ok(by('backglass').position.y > 1.2 && by('backglass').position.y < 1.9, String(by('backglass').position.y));
});

test('sans playfield, la tête reste en place ; le protocole du compagnon décrit chaque panneau puis « fin »', () => {
  const head = headsetPanels(sources.slice(1), 0);
  assert.deepEqual(head.map((p) => p.role), ['dmd', 'backglass']);
  const lines = headsetProtocol(headsetPanels(sources, 90));
  assert.equal(lines.length, 4);
  assert.equal(lines.at(-1), 'fin');
  const fields = lines[0]!.split(' ');
  assert.equal(fields[0], 'panneau');
  assert.equal(fields[1], 'playfield');
  assert.deepEqual(fields.slice(2, 6), ['0', '0', '3840', '2160']);
  assert.equal(fields.length, 15);
  assert.ok(fields.slice(6).every((f) => Number.isFinite(Number(f))), lines[0]);
});

test('manettes du casque : le compagnon lit tout le catalogue, profil par profil, et le dit au menu', () => {
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const cpp = source(repo, 'packages', 'casque-vr', 'src', 'casque.cpp');
  // Chaque élément du catalogue (manettes.ts) a son action, au même chemin, pour les mêmes profils.
  const keys: Record<string, string> = { touch: 't', index: 'i', vive: 'v', wmr: 'w' };
  for (const [name, def] of Object.entries(CONTROLLER_ELEMENTS)) {
    const flags = def.profiles.map((p) => keys[p]).join('');
    assert.ok(cpp.includes(`{ "${name}", `) && cpp.includes(`"${def.path}", "${flags}", ${def.axis ? 'true' : 'false'} }`), `${name} : ${def.path} (${flags})`);
  }
  for (const [name, def] of Object.entries(HEADSET_PROFILES)) assert.ok(cpp.includes(`"${name}", "${def.path}" }`), name);
  // Liaisons suggérées pour chaque profil ; le profil branché dit au menu.
  assert.match(cpp, /for \(const Profile& pr : profiles\)[\s\S]{0,1500}xrSuggestInteractionProfileBindings_\(instance, &ipsb\)/);
  assert.match(cpp, /XR_TYPE_EVENT_DATA_INTERACTION_PROFILE_CHANGED && controllers\)\s*sayProfile\(\);/);
  // Axes : la direction dominante, avec hystérésis, envoyée comme un bouton.
  assert.match(cpp, /pushed\[d\] > \(e\.dirs\[d\] \? 0\.4f : 0\.6f\)/);
  // Lus seulement quand le menu a le regard du joueur ; sinon, tout bouton tenu est relâché.
  assert.match(blockOf(cpp, 'if (controllers && state == XR_SESSION_STATE_FOCUSED)').after, /^\s*else\s+releaseControls\(\);/);
  // Le menu les reçoit comme les boutons de la borne (pas comme le téléphone), et les relâche casque retiré.
  const app = path.join(repo, 'app', 'src');
  const menu = fs.readFileSync(path.join(app, 'casque.ts'), 'utf8');
  assert.match(menu, /if \(parseControllerEvent\(button\[1\]!\)\) this\.opts\.onButton\?\.\(button\[1\]!, button\[2\] === '1'\);/);
  const frontend = fs.readFileSync(path.join(app, 'frontend.ts'), 'utf8');
  assert.match(frontend, /onButton: \(button, down\) => headsetButton\(button, down\),/);
  assert.match(frontend, /const action = menuActionOf\(controllerSetting\(\), name\);/);
  assert.match(frontend, /headsetKey\(b, true, false\);/);
  assert.match(frontend, /if \(!headset\?\.worn\) releaseHeadsetButtons\(\);/);
});

test('casque éteint ou Link coupé : l’affichage revient aux écrans du PC, en menu comme en partie ; retiré, rien ne bascule', () => {
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const cpp = source(repo, 'packages', 'casque-vr', 'src', 'casque.cpp');
  // VPX a pris le casque : le compagnon veille au lieu de partir, et reprend le casque quand VPX le rend.
  assert.match(cpp, /say\("releve VPX a pris le casque, veille"\);\s*handover = false;\s*standby = true;/);
  assert.match(cpp, /if \(standby && state == XR_SESSION_STATE_FOCUSED\)\s*\{\s*standby = false;\s*say\("reprise"\);/);
  // Seule une vraie perte le dit : session ou instance perdue, arrêt que personne n'a demandé hors relève.
  assert.match(cpp, /else if \(state == XR_SESSION_STATE_LOSS_PENDING\)\s*lost\("session perdue"\);/);
  assert.match(cpp, /XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING\)\s*lost\("instance perdue"\);/);
    assert.match(cpp, /if \(standby\)\s*say\("veille finie par le runtime"\);/);
  const app = path.join(repo, 'app', 'src');
  const menu = fs.readFileSync(path.join(app, 'casque.ts'), 'utf8');
  // Le menu reste au casque une fois porté, même retiré ; la veille d'une partie et la fin du compagnon le rendent au PC.
  assert.match(menu, /return Boolean\(this\.child\) && this\.viewsFlowing && this\.wornOnce && !this\.standby;/);
  assert.match(menu, /if \(line\.startsWith\('casque-perdu'\)\) \{\s*this\.lost = true;\s*this\.opts\.onLost\?\.\(this\.standby\);/);
  assert.match(menu, /if \(code !== 0 \|\| this\.lost\) this\.retryAt = Date\.now\(\) \+ RETRY_MS;/);
  const frontend = fs.readFileSync(path.join(app, 'frontend.ts'), 'utf8');
  assert.match(frontend, /const inHeadset = Boolean\(headset\?\.inUse\);/);
  assert.match(frontend, /onLost: \(inGame\) => headsetLost\(inGame\),/);
  // Partie dans le casque : le casque perdu ferme VPX (qui continuerait sans personne).
  assert.match(frontend, /playedVr = true;\s*vrGameStop = \(\) => game\.stop\(\);/);
  assert.match(frontend, /if \(inGame && vrGameStop\) \{[\s\S]{0,200}vrGameStop\(\);/);
});

test('pièce du Quest changée ou vue réinitialisée : la borne reste où elle est dans la vraie pièce', () => {
  // Essai du 10 novembre 2026 : « Réinitialiser la vue » de Link recentre la pièce de l'application qui a
  // le casque, et le runtime le garde pour elle seule, sous la clé de son exécutable (piece-vpx.test.ts).
  // Le compagnon repart donc sur une session neuve, sous une clé neuve : la pièce d'origine, celle de VPX,
  // où la borne calée est restée.
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const cpp = source(repo, 'packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(cpp, /say\(std::string\("piece-changee "\) \+ \(change->poseValid \? "pose " : "sans-pose "\)/);
  const menu = fs.readFileSync(path.join(repo, 'app', 'src', 'casque.ts'), 'utf8');
  assert.match(menu, /if \(line\.startsWith\('piece-changee'\)\) \{[\s\S]{0,2600}this\.roomRestart = true;\s*if \(now\) this\.restart\(\);\s*else this\.restartAfterGame = true;/);
  assert.doesNotMatch(menu, /onRoom\?\.\(this\.room, true\)/);
  assert.match(menu, /if \(this\.restartAfterGame\) this\.restart\(\);/);
  assert.match(menu, /if \(this\.roomRestart\) \{\s*this\.roomRestart = false;\s*this\.opts\.onRoomRestart\?\.\(Number\(eyes\[1\]\)\);/);
  const frontend = fs.readFileSync(path.join(repo, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /roomStale = Boolean\(eyeHeightProblem\(eyes\)\);/);
});

test('fin de partie et accueil de Link : le menu revient sans repasser par Link', () => {
  // La session en veille ne reprend le casque que rechoisie dans l'accueil de Link (5 à 11 s), une
  // session neuve le prend d'elle-même (1 s) ; l'arrêt de la session par le runtime n'est pas un casque perdu.
  // Au menu (13 novembre 2026, banc d'essai scripts/banc-casque.test.mjs) : casque retiré, la même session
  // est suspendue puis reprise ; une session neuve seulement si le runtime ne la redonne pas.
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const cpp = source(repo, 'packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(cpp, /if \(exitRequested \|\| handover \|\| standby\)\s*done = true;\s*else\s*\{\s*suspendedAt = GetTickCount64\(\);\s*say\("session-suspendue"\);/);
  assert.match(cpp, /say\("session-arretee pas reprise en " \+ std::to_string\(SUSPEND_MAX_MS \/ 1000\) \+ " s"\);/);
  const menu = fs.readFileSync(path.join(repo, 'app', 'src', 'casque.ts'), 'utf8');
  assert.match(menu, /if \(line === 'session-suspendue'\) \{[\s\S]{0,300}continue;/);
  assert.match(menu, /if \(line\.startsWith\('session-arretee'\)\) \{[\s\S]{0,300}this\.restartNow = true;/);
  assert.match(menu, /if \(this\.restartNow\) \{\s*this\.restartNow = false;\s*this\.retryAt = 0;\s*setImmediate\(\(\) => this\.check\(\)\);/);
  const frontend = fs.readFileSync(path.join(repo, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /headsetPaused = false;[\s\S]{0,500}if \(playedVr && headset\?\.standby\) \{[\s\S]{0,200}headset\.restart\(\);/);
});

test('tête de la borne au bureau : fronton un peu plus large que le plateau, DMD de moitié moins large dessous, petit topper dessus', () => {
  // Les écrans du PC de bureau (EDID) : un fronton de 41 cm, un DMD et un topper de 48 cm. Aux proportions
  // d'une borne (10 novembre 2026), quand ce n'est pas une vraie borne calée.
  const desk: HeadsetSource[] = [
    { role: 'playfield', rect: { x: 0, y: 0, width: 1920, height: 1080 } },
    { role: 'backglass', rect: { x: 1920, y: 0, width: 1366, height: 768 }, screenCm: { width: 41, height: 23 }, screenPx: { width: 1366, height: 768 } },
    { role: 'dmd', rect: { x: 3286, y: 0, width: 1920, height: 1080 }, screenCm: { width: 48, height: 27 }, screenPx: { width: 1920, height: 1080 } },
    { role: 'topper', rect: { x: 5206, y: 0, width: 1920, height: 1080 }, screenCm: { width: 48, height: 26 }, screenPx: { width: 1920, height: 1080 } },
  ];
  const panels = headsetPanels(desk, 90, { standardHead: true });
  const get = (role: string) => panels.find((p) => p.role === role)!;
  const pf = get('playfield');
  const playfieldWidth = Math.min(pf.width, pf.height);
  const bg = get('backglass');
  const dmd = get('dmd');
  const topper = get('topper');
  close(bg.width, STANDARD_HEAD.backglass * playfieldWidth);
  assert.ok(bg.width > playfieldWidth, 'fronton plus large que le plateau');
  close(dmd.width, bg.width / 2);
  close((dmd.width * dmd.height) / (bg.width * bg.height), 0.25 * ((1080 / 1920) / (768 / 1366)), 1e-3);
  assert.ok(topper.width < dmd.width, 'topper tout petit');
  // Tous centrés ; de bas en haut : DMD, fronton, topper posé sur le fronton.
  for (const p of [bg, dmd, topper]) close(p.position.x, 0);
  assert.ok(dmd.position.y < bg.position.y && bg.position.y < topper.position.y);
  close(topper.position.y - topper.height / 2 - (bg.position.y + bg.height / 2), 0.02);
  // Sur une vraie borne calée, les tailles réelles restent.
  close(headsetPanels(desk, 90).find((p) => p.role === 'backglass')!.width, 0.41);
});

test('fluidité dans le casque : la boucle des images n’attend jamais le GPU, la cadence est notée', () => {
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const cpp = source(repo, 'packages', 'casque-vr', 'src', 'casque.cpp');
  // Libération des textures d'Electron sur requête d'événement relue sans attendre (plus de gpuFinish par image).
  assert.match(cpp, /pendingReleases\.push_back\(std::move\(pr\)\);/);
  assert.match(cpp, /context->GetData\(pendingReleases\.front\(\)\.query\.Get\(\), &finished, sizeof finished, D3D11_ASYNC_GETDATA_DONOTFLUSH\)/);
  // Cadence toutes les 10 s : fréquence, images sautées (écart des temps d'affichage prédits), copie et rendu.
  assert.match(cpp, /"cadence casque %\.0f Hz, %\.1f images\/s, %d sautees, copie max %\.1f ms, rendu max %\.1f ms, %d images recues"/);
  const menu = fs.readFileSync(path.join(repo, 'app', 'src', 'casque.ts'), 'utf8');
  assert.match(menu, /\|cadence\|/);
});
