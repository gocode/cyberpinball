// Cadrage d'une table reprise d'une autre installation (23/11/2026) : retours de joueurs venus de PinUP Popper ou d'un
// dossier de VPX, leurs tables ne se cadraient plus comme avant. Le VPinballX.ini d'origine n'était jamais lu (mode
// Manuel / Ajuster / Remplir, mesures de l'écran), un POV que le VPX d'origine ignorait était appliqué, et le cadrage de
// Cyber Pinball (« Ajuster » qui garde le haut) remplaçait le leur.
// Invariants :
// - le cadrage figé reproduit celui du VPX d'origine (mode, mesures, vue lue) ;
// - aucun chemin automatique (réparations avant la partie et à l'installation, diagnostic, écran « Point de vue »)
//   ne touche ensuite au .ini de la table ; seul un choix du joueur le change ;
// - tout code qui écrit un mode de cadrage ou une vue dans un .ini est connu de ce test (garde sur les sources).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, pupPlayRepairs, repairPupForPlay, scriptFacts, type DoctorContext } from '../doctor';
import { applyOps } from '../fileops';
import { IniDocument } from '../ini';
import { originFramingOf, originIniCandidates, planOriginFraming, registryPlayerIni, withOriginFraming, type OriginVpx } from '../origin-framing';
import { parsePovXml, tablePovState } from '../povview';
import { scanTables } from '../tables';
import { devPcDisplays, vpxWithScript } from './fixtures';
import { REPO_ROOT } from './i18n-scan';

const TABLE = 'Attack from Mars (Bally 1995)';
const SCRIPT = 'Sub Table1_Init\r\nEnd Sub\r\n';
const VIEW_CODES = ['originFraming', 'povView', 'povOffered', 'povWrongWay', 'manualView', 'importedView', 'tableOrientation'];

/** POV « RaJo » nommé comme la table : une vue sans mode de cadrage, que VPX 10.8.1 ignore en cadrage automatique. */
const RAJO_INI = '[TableOverride]\r\nViewCabMode = 2\r\nViewCabScaleX = 1.2\r\nViewCabVOfs = -3\r\nViewCabRotation = 0\r\n';
const POV = '<?xml version="1.0"?>\r\n<POV>\r\n  <fullscreen>\r\n    <LayoutMode>2</LayoutMode>\r\n    <rotation>0</rotation>\r\n    <xscale>1.15</xscale>\r\n    <ViewVOfs>-4.5</ViewVOfs>\r\n  </fullscreen>\r\n</POV>\r\n';

/** Playfield paysage (joueur à droite de l'image), VPinballX.ini de la borne synchronisé (Ajuster, garder le haut). */
function landscape(): NonNullable<DoctorContext['orientation']> {
  return { window: devPcDisplays()[3]!, edge: 'right', globalIni: '[Player]\nBGSet = 1\nCabinetAutofitMode = 1\nCabinetAutofitKeepTop = 1\nCabinetAutofitMaxStretch = 0.15\nScreenWidth = 121.8\nScreenHeight = 68.5\n' };
}

function origin(version: string, ini: string): OriginVpx {
  return { exe: 'C:\\vPinball\\VisualPinball\\VPinballX64.exe', version, source: 'VPinballX.ini', ini };
}

/** Une table copiée depuis l'installation d'origine, son cadrage d'origine figé comme à l'ajout. */
function imported(files: Record<string, string>, vpx: OriginVpx, orientation = landscape()) {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-origine-'));
  const folder = path.join(tablesDir, TABLE);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${TABLE}.vpx`), vpxWithScript(SCRIPT));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), text);
  const ini = path.join(folder, `${TABLE}.ini`);
  const entry = () => scanTables(tablesDir)[0]!;
  const plan = planOriginFraming({ origin: vpx, tableIni: files[`${TABLE}.ini`], pov: files[`${TABLE}.pov`] ? parsePovXml(files[`${TABLE}.pov`]!) : undefined, orientation });
  if (plan.note) {
    if (plan.ini !== undefined) fs.writeFileSync(ini, plan.ini);
    const e = entry();
    fs.writeFileSync(e.infoFile, JSON.stringify(withOriginFraming(e.info, plan.note), null, 2));
  }
  const ctx = (o: DoctorContext['orientation'] = orientation): DoctorContext => ({ tablesDir, script: scriptFacts(SCRIPT), orientation: o });
  const trashDir = `${tablesDir}-corbeille`;
  const read = () => (fs.existsSync(ini) ? fs.readFileSync(ini, 'utf8') : undefined);
  const done = () => {
    fs.rmSync(tablesDir, { recursive: true, force: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
  };
  return { plan, ini, entry, ctx, trashDir, read, done };
}

/** Tout ce qui s'applique sans le joueur : rien ne doit changer le .ini de la table. */
function assertUntouchedByAutomaticPaths(s: ReturnType<typeof imported>): void {
  const before = s.read();
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()).map((f) => f.code), [], 'réparations avant la partie');
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  assert.equal(s.read(), before, 'réparations avant la partie et à l’installation');
  // Le diagnostic n'en fait pas une chose à corriger : une information, rien d'autre sur le cadrage.
  const views = diagnose(s.entry(), s.ctx()).filter((f) => VIEW_CODES.includes(f.code) && f.code !== 'povOffered');
  assert.deepEqual(views.map((f) => [f.code, f.severity]), [['originFraming', 'info']]);
  // L'écran « Point de vue » le dit, sans rien écrire de lui-même.
  assert.equal(tablePovState(s.entry().file, s.ctx().orientation, s.entry()).framing, 'origin');
  assert.equal(s.read(), before);
}

test('VPX 10.8.1 d’origine en « Ajuster » : son mode et ses mesures figés, le POV RaJo et le .pov qu’il ignorait ne s’appliquent pas', () => {
  const vpx = origin('10.8.1.5436', '[Version]\nVPinball = 10 8 1\n[Player]\nBGSet = 1\nCabinetAutofitMode = 1\nCabinetAutofitPos = 0.1\nScreenWidth = 110\nScreenHeight = 62\n');
  const s = imported({ [`${TABLE}.ini`]: RAJO_INI, [`${TABLE}.pov`]: POV }, vpx);
  const doc = IniDocument.parse(s.read()!);
  assert.equal(doc.get('Player', 'CabinetAutofitMode'), '1');
  assert.equal(doc.get('Player', 'CabinetAutofitKeepTop'), '0', 'garder le haut : absent du VPX d’origine');
  assert.equal(doc.get('Player', 'CabinetAutofitPos'), '0.1');
  assert.equal(doc.get('Player', 'ScreenWidth'), '110');
  assert.equal(doc.get('Player', 'ScreenHeight'), '62');
  assert.equal(doc.get('TableOverride', 'ViewCabScaleX'), '1.2', 'la vue du .ini reste telle quelle (ignorée en automatique, comme à l’origine)');
  assert.equal(originFramingOf(s.entry().info)?.mode, 'auto');
  assertUntouchedByAutomaticPaths(s);
  s.done();
});

test('VPX 10.8.1 d’origine sans réglage : cadrage manuel (défaut de VPX), vue du .ini de la table', () => {
  const vpx = origin('10.8.1.5436', '[Player]\nBGSet = 1\nPlayfieldWidth = 1920\nPlayfieldHeight = 1080\n');
  const s = imported({ [`${TABLE}.ini`]: RAJO_INI, [`${TABLE}.pov`]: POV }, vpx);
  const doc = IniDocument.parse(s.read()!);
  assert.equal(doc.get('Player', 'CabinetAutofitMode'), '0');
  assert.equal(doc.get('TableOverride', 'ViewCabScaleX'), '1.2', '10.8.1 lit le .ini, pas le .pov');
  // Mesures par défaut de VPX à l'origine (95,89 × 53,94 cm), différentes de celles de la borne : reprises.
  assert.equal(doc.get('Player', 'ScreenWidth'), '95.89');
  assertUntouchedByAutomaticPaths(s);
  s.done();
});

test('VPX 10.8.0 d’origine : cadrage manuel, vue du <table>.pov reportée dans le .ini (ce que 10.8.0 lisait)', () => {
  const vpx = origin('10.8.0.1234', '[Player]\nBGSet = 1\nWidth = 1920\nHeight = 1080\n');
  const s = imported({ [`${TABLE}.pov`]: POV }, vpx);
  const doc = IniDocument.parse(s.read()!);
  assert.equal(doc.get('Player', 'CabinetAutofitMode'), '0');
  assert.equal(doc.get('TableOverride', 'ViewCabScaleX'), '1.15');
  assert.equal(doc.get('Player', 'ScreenWidth'), undefined, 'mesure absente d’un VPX sans cadrage automatique : rien à reprendre');
  assertUntouchedByAutomaticPaths(s);
  s.done();
});

test('cadrage d’origine refusé : fenêtre tournée depuis, ou vue bureau d’un côté et borne de l’autre ; rien n’est écrit', () => {
  const portrait = origin('10.8.0.1234', '[Player]\nBGSet = 1\nWidth = 1080\nHeight = 1920\n');
  const turned = imported({ [`${TABLE}.ini`]: RAJO_INI.replace('ViewCabMode = 2\r\n', '') }, portrait);
  assert.ok(turned.plan.refused);
  assert.equal(turned.read(), RAJO_INI.replace('ViewCabMode = 2\r\n', ''));
  assert.equal(originFramingOf(turned.entry().info), undefined);
  turned.done();
  const desktop = imported({}, origin('10.8.1.5436', '[Player]\nBGSet = 0\n'));
  assert.ok(desktop.plan.refused);
  assert.equal(desktop.read(), undefined);
  desktop.done();
});

test('retour au cadrage de la borne : clés figées retirées, note effacée, et rien ne remet l’ancien cadrage', () => {
  const vpx = origin('10.8.1.5436', '[Player]\nBGSet = 1\nCabinetAutofitMode = 2\nScreenWidth = 110\n');
  const s = imported({ [`${TABLE}.ini`]: RAJO_INI, [`${TABLE}.pov`]: POV }, vpx);
  const finding = diagnose(s.entry(), s.ctx()).find((f) => f.code === 'originFraming')!;
  applyOps(finding.fix!.ops, { trashDir: s.trashDir });
  const doc = IniDocument.parse(s.read()!);
  assert.equal(doc.get('Player', 'CabinetAutofitMode'), '1', 'le mode de la borne');
  assert.equal(doc.get('Player', 'CabinetAutofitKeepTop'), undefined);
  assert.equal(doc.get('Player', 'ScreenWidth'), undefined);
  assert.equal(originFramingOf(s.entry().info), undefined);
  const after = s.read();
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  assert.equal(s.read(), after, 'ni le POV ni la vue du .ini ne reviennent');
  s.done();
});

test('réglages du VPX d’origine : où ils sont lus, et ceux du registre (VPX 10.7)', () => {
  const join = (...p: string[]) => p.join('\\');
  const dirname = (p: string) => p.replace(/\\[^\\]+$/, '');
  const exe = 'C:\\vPinball\\VisualPinball\\VPinballX64.exe';
  // %APPDATA% fictif (le dépôt est public : jamais de chemin de profil Windows).
  const appData = 'R:\\Roaming';
  assert.deepEqual(originIniCandidates(exe, '10.8.1.5436', appData, join, dirname), ['C:\\vPinball\\VisualPinball\\VPinballX.ini', 'R:\\Roaming\\VPinballX\\10.8\\VPinballX.ini']);
  assert.deepEqual(originIniCandidates(exe, '10.8.0.1234', appData, join, dirname), ['R:\\Roaming\\VPinballX\\VPinballX.ini', 'C:\\vPinball\\VisualPinball\\VPinballX.ini']);
  const reg = registryPlayerIni('\r\nHKEY_CURRENT_USER\\Software\\Visual Pinball\\VP10\\Player\r\n    BGSet    REG_DWORD    0x1\r\n    ScreenWidth    REG_SZ    52.000000\r\n');
  assert.equal(IniDocument.parse(reg).get('Player', 'BGSet'), '1');
  assert.equal(IniDocument.parse(reg).get('Player', 'ScreenWidth'), '52.000000');
});

/**
 * Les seuls fichiers qui écrivent un mode de cadrage ou une vue de borne dans un .ini. Un nouveau venu doit respecter le
 * cadrage figé d'une table reprise (originFramingOf) avant d'être ajouté ici.
 */
const FRAMING_WRITERS: Record<string, string> = {
  'packages/core/src/doctor.ts': 'manualView et tableOrientation, réparations proposées ; le cadrage d’origine passe avant (originFramingFinding)',
  'packages/core/src/origin-framing.ts': 'le cadrage d’origine lui-même',
  'packages/core/src/origin-framing-catchup.ts': 'le cadrage d’origine rendu une fois aux tables reprises avant, sauf cadrage choisi par le joueur (cadrage-rattrapage.test.ts)',
  'app/src/origin-framing-catchup.ts': 'idem, l’état d’avant gardé (framing-history.ts)',
  'packages/core/src/povview.ts': 'POV : appliqué seulement sans mode choisi (povView), sinon proposé ; écran « Point de vue »',
  'packages/core/src/tableview.ts': 'importedView : seulement sans mode choisi',
  'app/src/vpx-launch-compat.ts': 'copie à part pour VPX 10.8.0, le .ini de la table intact',
  'app/src/table-pov.ts': 'Point de vue : seulement le choix du joueur, l’état d’avant gardé (framing-history.ts)',
  'packages/core/src/framing-close-corners.ts': 'l’essai « au plus près des coins », pour une table seule : deux variantes (écran incliné ou à plat) : étirement 50 %, œil relevé et inclinaison dans son .ini, retirés avec lui',
  'packages/core/src/framing-custom.ts': 'la vue personnalisée du joueur, gardée puis remise par Point de vue seulement ; le cadrage d’origine est retiré avec elle',
  'packages/core/src/framing-styles.ts':'le style choisi pour une table, écrit par Point de vue',
  'app/src/cadrage-menu.ts': 'aperçus seulement : le .ini d’une copie de travail, jamais celui de la table',
  'app/src/frontend.ts': 'le style de la borne : VPinballX.ini, jamais le .ini d’une table',
};

test('garde : aucun autre code n’écrit de mode de cadrage ni de vue de borne dans un .ini', () => {
  // Une écriture directe ([Player] mode ou vue), ou l'appel d'une fonction qui en prépare une.
  const writes = /\.set\(\s*'(?:Player|TableOverride)'\s*,\s*(?:'(?:CabinetAutofit\w*|BGSet|ViewCab\w*)'|\w+\.key\b)|\bwithTableFramingStyle\(|\bFRAMING_STYLE_KEYS\b/;
  const found: string[] = [];
  for (const dir of ['packages/core/src', 'app/src']) {
    for (const name of fs.readdirSync(path.join(REPO_ROOT, dir))) {
      if (!name.endsWith('.ts')) continue;
      const rel = `${dir}/${name}`;
      if (writes.test(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'))) found.push(rel);
    }
  }
  assert.deepEqual(found.filter((f) => !FRAMING_WRITERS[f]), [], 'nouvel écrivain du cadrage : respecter le cadrage d’origine figé, puis l’ajouter à FRAMING_WRITERS');
});
