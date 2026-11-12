// Réalité virtuelle (vr.ts) : jamais de question de VPX (Autodetect), le VPinballX.ini de la borne
// jamais touché, les réglages de la VR gardés d'une partie à l'autre, le fronton ajouté seulement
// aux tables sans pièce VR, le runtime lu sans réveiller le casque.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IniDocument } from '../ini';
import { SYSTEM_GROUPS, SYSTEM_ITEMS } from '../systemmenu';
import { VPX_PLAY_SETTINGS } from '../vpx';
import { VPX_GAME_TITLES } from '../vpxwindows';
import { ANCILLARY_OUTPUTS, openXrRuntimeName, planVrIni, screensFallbackGaps, screensFallbackViewMode, tableHasVrRoom, VR_PREVIEW_TITLE, vrCarriedSettings, vrCenterKey, vrHasSavedPlace, vrMenuText, vrPreviewSettings, vrReadiness } from '../vr';

const CABINET_INI = '[Player]\r\nSecurityLevel = 0\r\nVRPreview = 1\r\n\r\n[PlayerVR]\r\nAskToTurnOn = 2\r\n\r\n[Input]\r\nMapping.InGameUI = F12\r\n';

test('la borne garde la VR éteinte ; une partie en VR la met en « Autodetect », jamais à 0 (question de VPX)', () => {
  assert.ok(VPX_PLAY_SETTINGS.some((s) => s.section === 'PlayerVR' && s.key === 'AskToTurnOn' && s.value === '2'));
  const plan = planVrIni(CABINET_INI, undefined, { addBackglass: true });
  const doc = IniDocument.parse(plan.text);
  assert.equal(doc.get('PlayerVR', 'AskToTurnOn'), '1');
  assert.equal(doc.get('PlayerVR', 'AddBackglass'), '1');
  // Le reste de l'INI de la borne est repris tel quel.
  assert.equal(doc.get('Player', 'SecurityLevel'), '0');
  assert.equal(doc.get('Input', 'Mapping.InGameUI'), 'F12');
  assert.ok(plan.text.includes('\r\n'), 'fins de ligne de VPX gardées');
});

test('casque pas prêt, partie sur les écrans : l’INI de la VR garde le fronton, le DMD et le topper de la borne', () => {
  // 12 novembre 2026, Aliens et son PuP-Pack : partie repliée sur les écrans avec un INI aux fenêtres
  // annexes éteintes, les voix du pack sans aucune vidéo. Vrai pour toute table, avec ou sans pièce VR.
  const cab = ['[Backglass]', 'BackglassOutput = 1', '[ScoreView]', 'ScoreViewOutput = 2', '[Topper]', 'TopperOutput = 1', '[PlayerVR]', 'AskToTurnOn = 2', ''].join('\r\n');
  // Un INI de la VR écrit par une version précédente (sorties à 0) ne les éteint plus.
  const old = ['[Backglass]', 'BackglassOutput = 0', '[ScoreView]', 'ScoreViewOutput = 0', '[Topper]', 'TopperOutput = 0', '[PlayerVR]', 'TableX = 3', ''].join('\r\n');
  for (const addBackglass of [true, false]) {
    for (const previous of [undefined, old]) {
      const text = planVrIni(cab, previous, { addBackglass }).text;
      const doc = IniDocument.parse(text);
      assert.equal(doc.get('Backglass', 'BackglassOutput'), '1');
      assert.equal(doc.get('ScoreView', 'ScoreViewOutput'), '2');
      assert.equal(doc.get('Topper', 'TopperOutput'), '1');
      assert.deepEqual(screensFallbackGaps(text, cab), []);
    }
  }
  // Le détecteur du journal : une fenêtre de la borne éteinte dans l'INI de la partie.
  assert.deepEqual(screensFallbackGaps(old, cab), ['backglass', 'dmd', 'topper']);
  // Une fenêtre que la borne n'a pas n'est pas une perte.
  assert.deepEqual(screensFallbackGaps(old, '[Backglass]\r\nBackglassOutput = 1\r\n[Topper]\r\nTopperOutput = 0\r\n'), ['backglass']);
  // Aucune sortie n'est reprise d'une partie à l'autre comme réglage de la VR.
  assert.deepEqual(vrCarriedSettings(old).filter((s) => ANCILLARY_OUTPUTS.some((o) => o.section === s.section && o.key === s.key)), []);
});

test('en VR, mode bureau (BGSet = 0) : les scripts ne montrent pas leur meuble de cabine devant le fronton', () => {
  const cab = ['[Player]', 'BGSet = 1', '[PlayerVR]', 'AskToTurnOn = 2', ''].join('\r\n');
  const text = planVrIni(cab, undefined, { addBackglass: true }).text;
  assert.equal(IniDocument.parse(text).get('Player', 'BGSet'), '0');
  // Repli de VPX sur les écrans avec cet INI : la vue « bureau » sur la borne est dite au journal.
  assert.equal(screensFallbackViewMode(text, cab), true);
  assert.equal(screensFallbackViewMode(text, '[Player]\r\nBGSet = 0\r\n'), false);
  assert.equal(screensFallbackViewMode(text, '[Player]\r\n'), false, 'sans BGSet, VPX est en mode bureau');
  // Les sorties annexes de la borne restent (session « casque pas prêt ») avec le mode bureau.
  const withBackglass = ['[Player]', 'BGSet = 1', '[Backglass]', 'BackglassOutput = 1', ''].join('\r\n');
  assert.deepEqual(screensFallbackGaps(planVrIni(withBackglass, undefined, { addBackglass: true }).text, withBackglass), []);
});

test('une table avec sa pièce VR garde son fronton : VPX n’en ajoute pas', () => {
  const doc = IniDocument.parse(planVrIni(CABINET_INI, undefined, { addBackglass: false }).text);
  assert.equal(doc.get('PlayerVR', 'AddBackglass'), '0');
});

test('les réglages de la VR de la partie précédente reviennent, sauf ceux que Cyber Pinball impose', () => {
  const previous = '[Player]\nVRPreview = 3\nSecurityLevel = 4\n[PlayerVR]\nAskToTurnOn = 0\nAddBackglass = 1\nOrientation = 12.5\nTableX = -3\nTableY = 40\nTableZ = 2\nLockFeetToGround = 0\n';
  const carried = vrCarriedSettings(previous);
  assert.deepEqual(
    carried.map((s) => `${s.section}.${s.key}=${s.value}`),
    ['PlayerVR.Orientation=12.5', 'PlayerVR.TableX=-3', 'PlayerVR.TableY=40', 'PlayerVR.TableZ=2', 'PlayerVR.LockFeetToGround=0'],
  );
  const plan = planVrIni(CABINET_INI, previous, { addBackglass: false });
  const doc = IniDocument.parse(plan.text);
  assert.equal(plan.carried, 5);
  assert.equal(doc.get('PlayerVR', 'TableY'), '40');
  // La recopie sur le playfield suit l'option de Cyber Pinball, jamais la partie précédente (éteinte par défaut).
  assert.equal(doc.get('Player', 'VRPreview'), '0');
  // Ce qui n'est pas un réglage de la VR vient de la borne, et Cyber Pinball impose les siens.
  assert.equal(doc.get('Player', 'SecurityLevel'), '0');
  assert.equal(doc.get('PlayerVR', 'AskToTurnOn'), '1');
  assert.equal(doc.get('PlayerVR', 'AddBackglass'), '0');
});

test('l’aperçu du casque prend la place de la fenêtre de jeu : écran du plateau, même mode', () => {
  // Borne : fronton, DMD et topper gardent leurs fenêtres en VR ; l'aperçu va sur le plateau, en plein écran comme lui.
  const cab = ['[Player]', 'PlayfieldDisplay = iiyama 43 [0, 0]', 'PlayfieldFullScreen = 1', '', '[Backglass]', 'BackglassDisplay = iiyama 32 [3840, 0]', '', '[PlayerVR]', 'AskToTurnOn = 2', ''].join('\r\n');
  const doc = IniDocument.parse(planVrIni(cab, undefined, { addBackglass: true, mirror: true }).text);
  assert.equal(doc.get('PlayerVR', 'PreviewDisplay'), 'iiyama 43 [0, 0]');
  assert.equal(doc.get('PlayerVR', 'PreviewFullScreen'), '1');
  assert.equal(doc.get('Player', 'VRPreview'), '1');
  // Recopie éteinte (par défaut) : plus rien dessiné, la fenêtre réduite à un timbre dans le coin du plateau.
  const off = IniDocument.parse(planVrIni(cab, undefined, { addBackglass: true }).text);
  assert.deepEqual(
    ['VRPreview', 'PreviewDisplay', 'PreviewFullScreen', 'PreviewWidth', 'PreviewHeight'].map((k) => off.get(k === 'VRPreview' ? 'Player' : 'PlayerVR', k)),
    ['0', 'iiyama 43 [0, 0]', '0', '320', '180'],
  );
  // Recalculé à chaque partie : la place d'une partie précédente (écran rebranché, renommé) ne revient pas.
  const previous = ['[PlayerVR]', 'PreviewDisplay = Ancien [0, 0]', 'PreviewFullScreen = 0', 'TableY = 40', ''].join('\n');
  assert.deepEqual(vrCarriedSettings(previous).map((s) => s.key), ['TableY']);
  const again = IniDocument.parse(planVrIni(cab, previous, { addBackglass: true, mirror: true }).text);
  assert.equal(again.get('PlayerVR', 'PreviewDisplay'), 'iiyama 43 [0, 0]');
  assert.equal(again.get('PlayerVR', 'TableY'), '40');
});

test('l’aperçu du casque : fenêtré si le jeu l’est, place par défaut de VPX sans écran choisi, choix de la borne respecté', () => {
  const windowed = ['[Player]', 'PlayfieldDisplay = BenQ [0, 0]', 'PlayfieldFullScreen = 0', ''].join('\n');
  assert.deepEqual(vrPreviewSettings(IniDocument.parse(windowed)).map((s) => `${s.key}=${s.value}`), ['PreviewDisplay=BenQ [0, 0]', 'PreviewFullScreen=0']);
  // Ni écran ni mode dans l'INI : VPX ouvre jeu et aperçu sur l'écran principal, rien à écrire.
  assert.deepEqual(vrPreviewSettings(IniDocument.parse(CABINET_INI)), []);
  const desk = IniDocument.parse(planVrIni(CABINET_INI, ['[PlayerVR]', 'PreviewDisplay = Ancien [0, 0]', ''].join('\n'), { addBackglass: true }).text);
  assert.equal(desk.get('PlayerVR', 'PreviewDisplay'), undefined);
  // L'écran de l'aperçu choisi dans le VPinballX.ini de la borne est respecté.
  const chosen = ['[Player]', 'PlayfieldDisplay = A [0, 0]', 'PlayfieldFullScreen = 1', '[PlayerVR]', 'PreviewDisplay = C [3840, 0]', 'PreviewFullScreen = 0', ''].join('\n');
  assert.deepEqual(vrPreviewSettings(IniDocument.parse(chosen)), []);
  const doc = IniDocument.parse(planVrIni(chosen, undefined, { addBackglass: true }).text);
  assert.equal(doc.get('PlayerVR', 'PreviewDisplay'), 'C [3840, 0]');
  assert.equal(doc.get('PlayerVR', 'PreviewFullScreen'), '0');
});

test('sans place enregistrée par VPX, la table est à recentrer ; la touche est celle de VRCenter', () => {
  // VPX n'a jamais quitté proprement : clés vides (premier essai du 9 novembre 2026).
  assert.equal(vrHasSavedPlace(['[PlayerVR]', 'Orientation = ', 'TableX = ', 'TableY = ', ''].join('\n')), false);
  assert.equal(vrHasSavedPlace(''), false);
  assert.equal(vrHasSavedPlace(['[PlayerVR]', 'Orientation = 12.5', 'TableX = 0', ''].join('\n')), true);
  assert.equal(vrHasSavedPlace(['[PlayerVR]', 'TableY = -40', ''].join('\n')), true);
  // Touche : celle de l'INI (Key;93 = pavé 5), sinon celle par défaut de VPX.
  assert.equal(vrCenterKey(['[Input]', 'Mapping.VRCenter = Key;93', ''].join('\n')), 'Numpad5');
  assert.equal(vrCenterKey(''), 'Numpad5');
  assert.equal(vrCenterKey(['[Input]', 'Mapping.VRCenter = Key;30', ''].join('\n')), 'Digit1');
});

test('pièce VR : reconnue au script (RenderingMode = 2, option de pièce, objets VR_…), pas dans les commentaires', () => {
  assert.equal(tableHasVrRoom(undefined), false);
  assert.equal(tableHasVrRoom('Sub Table1_Init\n  Controller.Run\nEnd Sub\n'), false);
  assert.equal(tableHasVrRoom("' VRRoom : pas encore\nSub Table1_Init\nEnd Sub\n"), false);
  assert.equal(tableHasVrRoom('If RenderingMode = 2 Then SetupVR\n'), true);
  assert.equal(tableHasVrRoom('Const VRRoom = 1\n'), true);
  assert.equal(tableHasVrRoom('Dim VR_Room\n'), true);
  assert.equal(tableHasVrRoom('VR_Cab.Visible = 1\nVR_Floor.Visible = 1\nVR_Wall.Visible = 1\n'), true);
  // Deux objets seulement : pas assez pour une pièce (un fronton VR isolé, par exemple).
  assert.equal(tableHasVrRoom('VR_Backglass.Visible = 1\nVR_Logo.Visible = 1\n'), false);
});

test('runtime OpenXR : son nom, ou pourquoi le casque ne peut pas servir', () => {
  assert.equal(openXrRuntimeName('C:\\Program Files\\Meta Horizon\\Support\\oculus-runtime\\oculus_openxr_64.json'), 'Meta Quest Link');
  assert.equal(openXrRuntimeName('C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR\\steamxr_win64.json'), 'SteamVR');
  assert.equal(openXrRuntimeName('C:\\Program Files\\Virtual Desktop Streamer\\OpenXR\\virtualdesktop-openxr.json'), 'Virtual Desktop');
  assert.equal(openXrRuntimeName('D:\\xr\\autre.json', '{"runtime":{"name":"Autre runtime"}}'), 'Autre runtime');
  assert.equal(openXrRuntimeName('D:\\xr\\autre.json', 'illisible'), 'autre');
  assert.deepEqual(vrReadiness({ manifest: 'C:\\x\\oculus_openxr_64.json', text: '{}' }), { ready: true, runtime: 'Meta Quest Link' });
  const none = vrReadiness({});
  assert.equal(none.ready, false);
  assert.match(none.ready ? '' : none.reason, /Meta Quest Link, SteamVR ou Virtual Desktop/);
  const gone = vrReadiness({ manifest: 'C:\\x\\oculus_openxr_64.json' });
  assert.match(gone.ready ? '' : gone.reason, /introuvable \(oculus_openxr_64\.json\)/);
});

test('l’entrée « Réalité virtuelle » de la rubrique Borne : grisée avec sa raison sans runtime', () => {
  // Tous les réglages du casque dans Borne > Réalité virtuelle, l'activation en tête (12/11/2026).
  assert.ok(SYSTEM_GROUPS.borne.entries.includes('realite-virtuelle'));
  assert.equal(SYSTEM_GROUPS['realite-virtuelle'].entries[0], 'vr');
  assert.equal(SYSTEM_ITEMS.vr.label, 'Réalité virtuelle');
  assert.equal(SYSTEM_GROUPS['realite-virtuelle'].icon, 'vr');
  assert.equal(SYSTEM_ITEMS.vr.icon, 'power');
  const off = vrMenuText('off', { ready: true, runtime: 'Meta Quest Link' });
  assert.equal(off.label, 'Réalité virtuelle : désactivée');
  assert.match(off.detail, /^Meta Quest Link installé/);
  assert.equal(vrMenuText('auto', { ready: true, runtime: 'SteamVR' }).label, 'Réalité virtuelle : activée');
  // Le menu dans le casque : son état suit le détail, seulement quand la VR est activée.
  assert.match(vrMenuText('auto', { ready: true, runtime: 'Meta Quest Link' }, 'shown').detail, / · menu de Cyber Pinball dans le casque$/);
  assert.match(vrMenuText('auto', { ready: true, runtime: 'Meta Quest Link' }, 'waiting').detail, /dès qu’il est prêt$/);
  assert.match(vrMenuText('auto', { ready: true, runtime: 'Meta Quest Link' }, 'missing').detail, /compagnon absent/);
  assert.doesNotMatch(vrMenuText('off', { ready: true, runtime: 'Meta Quest Link' }, 'missing').detail, /compagnon/);
  const blocked = vrMenuText('auto', { ready: false, reason: 'raison' });
  assert.deepEqual(blocked, { label: 'Réalité virtuelle : indisponible', detail: 'raison', unavailable: true });
});

test("l'aperçu de la VR est une fenêtre de jeu de VPX, jamais une fenêtre inconnue", () => {
  assert.ok((VPX_GAME_TITLES as readonly string[]).includes(VR_PREVIEW_TITLE));
});
