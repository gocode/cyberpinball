// La pose écrite pour VPX met-elle sa table là où est la borne du casque ?
//
// Rejoue le calcul de VPX 10.8.1 (rév. 5436, src/renderer/VRDevice.cpp, VRDevice::UpdateVR : m_pfWorld)
// avec ses matrices (src/math/matrix.h : vecteur ligne, translation en dernière ligne, SetRotateX/Z),
// sur les réglages que Cyber Pinball écrit dans l'INI de la partie (placeVpxSettings), et vérifie que le
// bas du plateau tombe devant la barre avant touchée au calage, à sa hauteur, le plateau partant devant
// le joueur ; pour plusieurs orientations, et les deux configurations (borne calée aux coins, bureau posé
// sur le regard). Essai du 10 novembre 2026 : table « derrière lui et sous le sol » en partie.

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLASS_DROP_M } from '../casque';
import { freePlace, lockbarPlace, lockbarVpxSettings, placeLockbar, placeVpxSettings, vpxPlaceProblem, vpxRecenteredHead, VPX_TABLE_OFFSET_MAX_CM, type CabinetPlace, type Point3 } from '../calage';
import type { VpxSetting } from '../vpx';

type M = number[][];
const identity = (): M => [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (r === c ? 1 : 0)));
const mul = (a: M, b: M): M => a.map((row) => [0, 1, 2, 3].map((c) => row.reduce((sum, v, k) => sum + v * b[k]![c]!, 0)));
const scale = (x: number, y = x, z = x): M => {
  const m = identity();
  m[0]![0] = x;
  m[1]![1] = y;
  m[2]![2] = z;
  return m;
};
const translate = (x: number, y: number, z: number): M => {
  const m = identity();
  m[3] = [x, y, z, 1];
  return m;
};
// Matrix3D::SetRotateX : _22 = _33 = cos, _23 = sin, _32 = -sin.
const rotateX = (a: number): M => {
  const m = identity();
  m[1]![1] = m[2]![2] = Math.cos(a);
  m[1]![2] = Math.sin(a);
  m[2]![1] = -Math.sin(a);
  return m;
};
// Matrix3D::SetRotateZ : _11 = _22 = cos, _12 = sin, _21 = -sin.
const rotateZ = (a: number): M => {
  const m = identity();
  m[0]![0] = m[1]![1] = Math.cos(a);
  m[0]![1] = Math.sin(a);
  m[1]![0] = -Math.sin(a);
  return m;
};
const apply = (m: M, v: [number, number, number]): [number, number, number] => {
  const r = [0, 1, 2].map((c) => v[0] * m[0]![c]! + v[1] * m[1]![c]! + v[2] * m[2]![c]! + m[3]![c]!);
  return [r[0]!, r[1]!, r[2]!];
};

// Unités de VPX : 1 VPU = 1,0625 pouce / 50.
const VPU_CM = (2.54 * 1.0625) / 50;
const cmToVpu = (cm: number) => cm / VPU_CM;
const DEG = Math.PI / 180;

/** Une table standard : plateau de 20 1/4" sur 45", vitre à 3" au-dessus du bas du plateau, pente de 6,5°. */
const TABLE = { right: cmToVpu(20.25 * 2.54), bottom: cmToVpu(45 * 2.54), glassBottom: cmToVpu(3 * 2.54), slope: 6.5 };

/** Où VPX pose un point du plateau (unités VPX, z vers le haut), en mètres dans l'espace du casque. */
function vpxWorld(settings: readonly VpxSetting[], point: [number, number, number], table: typeof TABLE = TABLE): Point3 {
  const get = (key: string) => Number(settings.find((s) => s.key === key)!.value);
  // Réglages bornés par VPX (Settings_properties.inl).
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const orientation = clamp(get('Orientation'), -180, 180);
  const tableX = clamp(get('TableX'), -100, 100);
  const tableY = clamp(get('TableY'), -100, 100);
  const tableZ = clamp(get('TableZ'), -100, 100);
  const lockbarWidth = get('LockbarWidth');
  const lockbarHeight = get('LockbarHeight');
  const lockbarToPlayfield = 5;
  const s = clamp(lockbarWidth / (table.right * VPU_CM + 2.25 * 2.54), 0.1, 2);
  const scaledGlassHeight = s * table.glassBottom * VPU_CM;
  const viewOrientation = mul(rotateZ(orientation * DEG), rotateX(-90 * DEG));
  const toWorld = [
    scale(s),
    scale(1, -1, 1),
    translate(-s * table.right * 0.5, s * table.bottom, 0),
    rotateX(table.slope * DEG),
    translate(-cmToVpu(tableX), cmToVpu(tableY + lockbarToPlayfield), cmToVpu(tableZ + lockbarHeight - scaledGlassHeight)),
    viewOrientation,
  ].reduce(mul);
  const [x, y, z] = apply(toWorld, point);
  const m = VPU_CM / 100;
  return { x: x * m, y: y * m, z: z * m };
}

const close = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps, `${what} : ${a.toFixed(4)} ≠ ${b.toFixed(4)}`);

/** La table de VPX sur la borne du casque posée à `place` : barre avant, hauteur, sens du plateau. */
function assertOnCabinet(place: CabinetPlace, settings: readonly VpxSetting[], what: string): void {
  const { left, right } = placeLockbar(place);
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
  const forward = { x: -Math.sin(place.yaw), z: -Math.cos(place.yaw) };
  const side = { x: -forward.z, z: forward.x };
  const width = Number(settings.find((s) => s.key === 'LockbarWidth')!.value);
  const s = Math.min(2, Math.max(0.1, width / (TABLE.right * VPU_CM + 2.25 * 2.54)));
  const bottom = vpxWorld(settings, [TABLE.right / 2, TABLE.bottom, 0]);
  const top = vpxWorld(settings, [TABLE.right / 2, 0, 0]);
  const leftEdge = vpxWorld(settings, [0, TABLE.bottom, 0]);
  const d = { x: bottom.x - center.x, z: bottom.z - center.z };
  // Bas du plateau : juste devant la barre avant (les 5 cm de VPX, plus 5 cm à l'échelle), dans son axe.
  close(d.x * forward.x + d.z * forward.z, (5 + 5 * s) / 100, 2e-3, `${what} : bas du plateau devant la barre avant`);
  close(d.x * side.x + d.z * side.z, 0, 2e-3, `${what} : bas du plateau dans l'axe de la barre avant`);
  // À la hauteur de la barre avant, moins la vitre : jamais sous le sol.
  close(bottom.y, center.y - (s * TABLE.glassBottom * VPU_CM) / 100, 2e-3, `${what} : hauteur du plateau`);
  assert.ok(bottom.y > 0.3, `${what} : plateau à ${bottom.y.toFixed(2)} m du sol`);
  // Le plateau part devant le joueur (et monte avec sa pente), le bord gauche à sa gauche.
  const run = (top.x - bottom.x) * forward.x + (top.z - bottom.z) * forward.z;
  close(run, (s * TABLE.bottom * VPU_CM * Math.cos(TABLE.slope * DEG)) / 100, 5e-3, `${what} : longueur du plateau devant le joueur`);
  assert.ok(top.y > bottom.y, `${what} : le haut du plateau plus haut que le bas`);
  assert.ok((leftEdge.x - bottom.x) * side.x + (leftEdge.z - bottom.z) * side.z < 0, `${what} : bord gauche du plateau à gauche`);
}

const YAWS = [-179, -135, -90, -10.237, 0, 30, 90, 150, 180];

test('pose de VPX : borne calée aux deux coins, la table sur la barre avant touchée, quelle que soit l’orientation', () => {
  for (const deg of YAWS) {
    const yaw = deg * DEG;
    // Barre avant de 72 cm à 86 cm du sol, son milieu à 60 cm du centre de la pièce.
    const center = { x: 0.35 * Math.cos(yaw + 1), z: 0.35 * Math.sin(yaw + 1) };
    const along = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const left = { x: center.x - along.x * 0.36, y: 0.86, z: center.z - along.z * 0.36 };
    const right = { x: center.x + along.x * 0.36, y: 0.86, z: center.z + along.z * 0.36 };
    const place = lockbarPlace(left, right);
    close(place.yaw, Math.atan2(Math.sin(yaw), Math.cos(yaw)), 1e-9, `lacet ${deg}°`);
    assert.deepEqual(placeVpxSettings(place), lockbarVpxSettings(left, right));
    assertOnCabinet(place, placeVpxSettings(place), `borne, ${deg}°`);
  }
});

test('pose de VPX : bureau, la borne posée sur le regard, la table devant le joueur à 88 cm', () => {
  for (const deg of YAWS) {
    const place = freePlace({ x: -0.2, z: 0.4, yaw: deg * DEG });
    assertOnCabinet(place, placeVpxSettings(place), `bureau, ${deg}°`);
  }
});

test('pose de VPX : le calage de l’essai du 10 novembre 2026 met la table devant le joueur, pas derrière', () => {
  // casque-borne.json du PC de développement, et les réglages écrits dans l'INI de la partie.
  const place: CabinetPlace = { lockbarHeight: 0.6643095, x: -0.1432302854750067, z: -0.018194771567023094, yaw: -0.1786615808741793, lockbarWidth: 0.4288668078588036, free: true };
  const settings = placeVpxSettings(place);
  assert.deepEqual(
    settings.map((s) => `${s.key}=${s.value}`),
    ['Orientation=-10.237', 'TableX=14.418', 'TableY=32.997', 'TableZ=0', 'LockbarWidth=42.887', 'LockbarHeight=66.431'],
  );
  assertOnCabinet(place, settings, 'essai du 10 novembre');
  // Les points touchés : la barre avant à (−0,09 ; 0,66 ; −0,31), devant ses yeux (regard vers −z).
  const bottom = vpxWorld(settings, [TABLE.right / 2, TABLE.bottom, 0]);
  assert.ok(bottom.z < -0.3 && bottom.y > 0.55, `bas du plateau en (${bottom.x.toFixed(2)}, ${bottom.y.toFixed(2)}, ${bottom.z.toFixed(2)})`);
});

test('pose de VPX : au-delà d’un mètre du centre de la pièce, VPX borne la place et la table quitte la borne', () => {
  const place = freePlace({ x: 1.3, z: -0.4, yaw: 0.5 });
  const settings = placeVpxSettings(place);
  assert.ok(settings.some((s) => (s.key === 'TableX' || s.key === 'TableY') && Math.abs(Number(s.value)) > VPX_TABLE_OFFSET_MAX_CM));
  assert.match(vpxPlaceProblem(settings) ?? '', /plus d’un mètre du centre de la limite du Quest/);
  assert.throws(() => assertOnCabinet(place, settings, 'trop loin'));
  assert.equal(vpxPlaceProblem(placeVpxSettings(freePlace({ x: 0.3, z: -0.4, yaw: 0.5 }))), undefined);
});

test('pose de VPX : le 9 novembre 2026, VPX et le compagnon voyaient la tête au même endroit de la pièce', () => {
  // Recentrage de VPX (5 du pavé, 18:26) réécrit dans l'INI : Orientation −36,98074, TableX 53,47311,
  // TableY −34,819607 ; tête relevée par le compagnon juste avant : x −0,576465, z −0,123397.
  const head = vpxRecenteredHead({ orientation: -36.98074, tableX: 53.47311, tableY: -34.819607 });
  assert.ok(Math.abs(head.x - -0.576465) < 0.002 && Math.abs(head.z - -0.123397) < 0.002, `tête vue par VPX en (${head.x.toFixed(3)}, ${head.z.toFixed(3)})`);
  // Et l'aller : la formule de VPX redonne ses réglages à partir de cette tête.
  const a = head.yaw;
  const dx = -head.x * 100;
  const dy = -head.z * 100;
  close(dx * Math.cos(a) - dy * Math.sin(a), 53.47311, 0.01, 'TableX');
  close(dx * Math.sin(a) + dy * Math.cos(a) - 10, -34.819607, 0.01, 'TableY');
});

test('pose de VPX : la table du 10 novembre 2026 derrière le joueur et sous le sol, c’est l’ancienne pièce du Quest', () => {
  // Le même bord de bureau touché avant (09:51) et après (09:53) que le Quest refasse sa pièce sous le
  // compagnon (« piece-changee » à 09:52:08) : même largeur, mais 1,25 m plus bas et tourné de 131°.
  const before = { left: { x: -0.451643, y: 1.916041, z: 1.017378 }, right: { x: -0.677012, y: 1.914666, z: 0.651164 } };
  const after = { left: { x: -0.300859, y: 0.658493, z: -0.351513 }, right: { x: 0.121026, y: 0.670126, z: -0.275326 } };
  const span = (p: typeof before) => Math.hypot(p.right.x - p.left.x, p.right.z - p.left.z);
  close(span(before), span(after), 0.02, 'largeur du bord de bureau');
  const angle = (p: typeof before) => Math.atan2(p.right.z - p.left.z, p.right.x - p.left.x);
  const turn = angle(after) - angle(before);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const toAfter = (p: Point3): Point3 => {
    const x = p.x - before.left.x;
    const z = p.z - before.left.z;
    return { x: after.left.x + c * x - s * z, y: p.y + (after.left.y - before.left.y), z: after.left.z + s * x + c * z };
  };
  const r = toAfter(before.right);
  close(r.x, after.right.x, 0.02, 'coin droit, x');
  close(r.z, after.right.z, 0.02, 'coin droit, z');
  // La place calée après le changement, écrite pour VPX : posée dans l'ancienne pièce (celle d'une application
  // qui démarre), le bas du plateau tombe, dans la nouvelle, derrière la tête et sous le sol.
  const place = lockbarPlace(after.left, after.right);
  const bottom = toAfter(vpxWorld(placeVpxSettings(place), [TABLE.right / 2, TABLE.bottom, 0]));
  const head = { x: -0.089446, z: -0.185942, yaw: -0.171145 };
  const ahead = (bottom.x - head.x) * -Math.sin(head.yaw) + (bottom.z - head.z) * -Math.cos(head.yaw);
  assert.ok(ahead < -0.5, `bas du plateau à ${ahead.toFixed(2)} m devant la tête : derrière`);
  assert.ok(bottom.y < 0, `bas du plateau à ${bottom.y.toFixed(2)} m : sous le sol`);
});

test('pose de VPX : le plateau de VPX exactement sur celui du menu, en position, en hauteur et en taille, au bureau comme sur une borne', () => {
  // Vitres du bas des tables installées (readVpxGlass) : 7,6 cm, 10,8 cm (Back to the Future), 21,6 cm
  // (la plupart), 27 cm ; plateaux de 51,4 et 54,6 cm. Sans recalage, VPX posait le plateau jusqu'à 20 cm
  // sous la barre avant, le menu 5 cm (essai du 10 novembre 2026 : « la table de jeu un peu plus basse »).
  const cabinet = lockbarPlace({ x: -0.36, y: 0.86, z: -0.6 }, { x: 0.36, y: 0.86, z: -0.6 });
  const places = [...[-150, -10, 0, 75, 180].map((deg) => freePlace({ x: 0.2, z: -0.3, yaw: deg * DEG })), cabinet];
  for (const [widthCm, glassCm] of [[51.4, 7.6], [51.4, 10.8], [54.6, 21.6], [51.4, 27]] as const) {
    const table = { right: cmToVpu(widthCm), bottom: TABLE.bottom, glassBottom: cmToVpu(glassCm), slope: TABLE.slope };
    for (const menuWidthM of [0.52, 0.62]) {
      for (const place of places) {
        const settings = placeVpxSettings(place, { widthCm, glassBottomCm: glassCm }, menuWidthM);
        const { left, right } = placeLockbar(place);
        const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
        const bottom = vpxWorld(settings, [table.right / 2, table.bottom, 0], table);
        const what = `${place.free ? 'bureau' : 'borne'}, vitre ${glassCm} cm, menu de ${menuWidthM} m, lacet ${Math.round(place.yaw / DEG)}°`;
        // Le bas du plateau au droit de la barre avant, GLASS_DROP_M sous elle : là où le menu le pose.
        close(bottom.x, center.x, 2e-3, `${what} : x`);
        close(bottom.z, center.z, 2e-3, `${what} : z`);
        close(bottom.y, center.y - GLASS_DROP_M, 2e-3, `${what} : hauteur`);
        // La largeur du plateau de VPX : celle du plateau du menu.
        const a = vpxWorld(settings, [0, table.bottom, 0], table);
        const b = vpxWorld(settings, [table.right, table.bottom, 0], table);
        close(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), menuWidthM, 2e-3, `${what} : largeur`);
      }
    }
  }
});
