// Réalité virtuelle (vr.ts) : jamais de question de VPX (Autodetect), le VPinballX.ini de la borne
// jamais touché, les réglages de la VR gardés d'une partie à l'autre, le fronton ajouté seulement
// aux tables sans pièce VR, le runtime lu sans réveiller le casque.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IniDocument } from '../ini';
import { SYSTEM_GROUPS, SYSTEM_ITEMS } from '../systemmenu';
import { VPX_PLAY_SETTINGS } from '../vpx';
import { VPX_GAME_TITLES } from '../vpxwindows';
import { openXrRuntimeName, planVrIni, tableHasVrRoom, VR_PREVIEW_TITLE, vrCarriedSettings, vrMenuText, vrPreviewSettings, vrReadiness } from '../vr';

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

test('une table avec sa pièce VR garde son fronton : VPX n’en ajoute pas', () => {
  const doc = IniDocument.parse(planVrIni(CABINET_INI, undefined, { addBackglass: false }).text);
  assert.equal(doc.get('PlayerVR', 'AddBackglass'), '0');
});

test('les réglages de la VR de la partie précédente reviennent, sauf ceux que Cyber Pinball impose', () => {
  const previous = '[Player]\nVRPreview = 3\nSecurityLevel = 4\n[PlayerVR]\nAskToTurnOn = 0\nAddBackglass = 1\nOrientation = 12.5\nTableX = -3\nTableY = 40\nTableZ = 2\nLockFeetToGround = 0\n';
  const carried = vrCarriedSettings(previous);
  assert.deepEqual(
    carried.map((s) => `${s.section}.${s.key}=${s.value}`),
    ['Player.VRPreview=3', 'PlayerVR.Orientation=12.5', 'PlayerVR.TableX=-3', 'PlayerVR.TableY=40', 'PlayerVR.TableZ=2', 'PlayerVR.LockFeetToGround=0'],
  );
  const plan = planVrIni(CABINET_INI, previous, { addBackglass: false });
  const doc = IniDocument.parse(plan.text);
  assert.equal(plan.carried, 6);
  assert.equal(doc.get('PlayerVR', 'TableY'), '40');
  assert.equal(doc.get('Player', 'VRPreview'), '3');
  // Ce qui n'est pas un réglage de la VR vient de la borne, et Cyber Pinball impose les siens.
  assert.equal(doc.get('Player', 'SecurityLevel'), '0');
  assert.equal(doc.get('PlayerVR', 'AskToTurnOn'), '1');
  assert.equal(doc.get('PlayerVR', 'AddBackglass'), '0');
});

test('l’aperçu du casque va en plein écran sur l’écran du fronton, face aux spectateurs', () => {
  const cab = ['[Player]', 'PlayfieldDisplay = iiyama 43 [0, 0]', '', '[Backglass]', 'BackglassDisplay = iiyama 32 [3840, 0]', '', '[PlayerVR]', 'AskToTurnOn = 2', ''].join('\r\n');
  const doc = IniDocument.parse(planVrIni(cab, undefined, { addBackglass: true }).text);
  assert.equal(doc.get('PlayerVR', 'PreviewDisplay'), 'iiyama 32 [3840, 0]');
  assert.equal(doc.get('PlayerVR', 'PreviewFullScreen'), '1');
  // Recalculé à chaque partie : la place d'une partie précédente (écran rebranché, renommé) ne revient pas.
  const previous = ['[PlayerVR]', 'PreviewDisplay = Ancien [0, 0]', 'PreviewFullScreen = 0', 'TableY = 40', ''].join('\n');
  assert.deepEqual(vrCarriedSettings(previous).map((s) => s.key), ['TableY']);
  const again = IniDocument.parse(planVrIni(cab, previous, { addBackglass: true }).text);
  assert.equal(again.get('PlayerVR', 'PreviewDisplay'), 'iiyama 32 [3840, 0]');
  assert.equal(again.get('PlayerVR', 'TableY'), '40');
});

test('l’aperçu du casque garde la place par défaut de VPX sans écran de fronton, ou quand la borne en a choisi une', () => {
  // PC de bureau : pas d'écran de fronton, ou le même que le plateau.
  assert.deepEqual(vrPreviewSettings(IniDocument.parse(CABINET_INI)), []);
  const same = ['[Player]', 'PlayfieldDisplay = BenQ [0, 0]', '[Backglass]', 'BackglassDisplay = BenQ [0, 0]', ''].join('\n');
  assert.deepEqual(vrPreviewSettings(IniDocument.parse(same)), []);
  const desk = IniDocument.parse(planVrIni(CABINET_INI, ['[PlayerVR]', 'PreviewDisplay = Ancien [0, 0]', ''].join('\n'), { addBackglass: true }).text);
  assert.equal(desk.get('PlayerVR', 'PreviewDisplay'), undefined);
  // L'écran de l'aperçu choisi dans le VPinballX.ini de la borne est respecté.
  const chosen = ['[Player]', 'PlayfieldDisplay = A [0, 0]', '[Backglass]', 'BackglassDisplay = B [1920, 0]', '[PlayerVR]', 'PreviewDisplay = C [3840, 0]', 'PreviewFullScreen = 0', ''].join('\n');
  assert.deepEqual(vrPreviewSettings(IniDocument.parse(chosen)), []);
  const doc = IniDocument.parse(planVrIni(chosen, undefined, { addBackglass: true }).text);
  assert.equal(doc.get('PlayerVR', 'PreviewDisplay'), 'C [3840, 0]');
  assert.equal(doc.get('PlayerVR', 'PreviewFullScreen'), '0');
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
  assert.ok(SYSTEM_GROUPS.borne.entries.includes('vr'));
  assert.equal(SYSTEM_ITEMS.vr.label, 'Réalité virtuelle');
  assert.equal(SYSTEM_ITEMS.vr.icon, 'vr');
  const off = vrMenuText('off', { ready: true, runtime: 'Meta Quest Link' });
  assert.equal(off.label, 'Réalité virtuelle : désactivée');
  assert.match(off.detail, /^Meta Quest Link installé/);
  assert.equal(vrMenuText('auto', { ready: true, runtime: 'SteamVR' }).label, 'Réalité virtuelle : activée');
  const blocked = vrMenuText('auto', { ready: false, reason: 'raison' });
  assert.deepEqual(blocked, { label: 'Réalité virtuelle : indisponible', detail: 'raison', unavailable: true });
});

test("l'aperçu de la VR est une fenêtre de jeu de VPX, jamais une fenêtre inconnue", () => {
  assert.ok((VPX_GAME_TITLES as readonly string[]).includes(VR_PREVIEW_TITLE));
});
