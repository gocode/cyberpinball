// Relevé du score d'une partie seul à la table, par l'inspector de VPX (décision du 25/11/2026) : la
// table n'est ni copiée ni modifiée (un double perdrait la nvram, VPReg et les records de la partie).
// VPX lit une carte réduite posée dans le dossier pinmame\memmaps de la table (vpxinspector.ts), publie
// chaque valeur de l'état de jeu de la ROM (scores, joueur, bille, fin de partie : romLivePlan, toutes
// par l'inspector), et l'application les lit par 127.0.0.1 : /api/tree (le numéro de chaque valeur, par
// son nom) puis /api/states (leur valeur), au format de VPX 10.8.1.
//
// Pur : les lectures HTTP sont dans l'application (app/src/solo-score-watch.ts).

import type { RomMemory } from './ballcount';
import { romLivePlan, type InspectorState, type NvField } from './livestate';
import type { GameSample } from './gametracker';

export interface SoloInspectPlan {
  /** Les valeurs à faire publier à VPX (inspectorMemMapFiles). */
  states: InspectorState[];
  /** Les noms, dans l'ordre : scores, joueur, bille, fin, [joueurs], [billes]. */
  decode(values: ReadonlyMap<string, number>): GameSample | undefined;
}

/** Ce que le relevé peut lire dans la mémoire de cette ROM par l'inspector, ou pourquoi pas. */
export function soloInspectPlan(memory: RomMemory): { ok: true; plan: SoloInspectPlan } | { ok: false; reason: string } {
  const made = romLivePlan(memory, { inspector: true, all: true });
  if (!made.ok) return made;
  const p = made.plan;
  const fields = [...p.scores, p.player, p.ball, p.over, ...(p.players ? [p.players] : []), ...(p.balls ? [p.balls] : [])];
  if (fields.some((f) => !f.state)) return { ok: false, reason: 'valeur de l’état de jeu hors de l’inspector' }; // i18n-ignore : journal
  const value = (f: NvField, values: ReadonlyMap<string, number>): number | undefined => {
    const raw = values.get(f.state!.name);
    if (raw === undefined || !Number.isFinite(raw)) return undefined;
    const masked = f.mask !== undefined ? raw & f.mask : raw;
    if (!f.bool) return masked;
    return (f.bool.invert ? masked === 0 : masked !== 0) ? 1 : 0;
  };
  return {
    ok: true,
    plan: {
      states: fields.map((f) => f.state!),
      decode(values) {
        const scores = p.scores.map((f) => value(f, values));
        const ball = value(p.ball, values);
        const over = value(p.over, values);
        if (scores.some((s) => s === undefined || s < 0) || ball === undefined || over === undefined) return undefined;
        // La ROM laisse les scores de la partie d'avant à l'attente : « en partie » est la fin de partie fausse.
        return { at: 0, inGame: over === 0, ball: Math.max(1, ball), scores: scores as number[] };
      },
    },
  };
}

/** Le numéro (mapping) de chaque valeur nommée dans /api/tree ; une valeur absente n'est pas dans la table. */
export function inspectorIds(tree: unknown, names: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  const wanted = new Set(names);
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return void node.forEach(walk);
    const n = node as { name?: unknown; mapping?: unknown; children?: unknown };
    if (typeof n.name === 'string' && wanted.has(n.name) && (typeof n.mapping === 'string' || typeof n.mapping === 'number')) found.set(n.name, String(n.mapping));
    walk(n.children);
  };
  const root = tree as { tree?: unknown } | undefined;
  walk(root?.tree ?? tree);
  return found;
}

/** Les valeurs de /api/states par numéro. */
export function inspectorStates(states: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const list = (states as { states?: unknown } | undefined)?.states;
  if (!Array.isArray(list)) return out;
  for (const s of list as { id?: unknown; state?: unknown }[]) {
    const v = typeof s.state === 'string' ? Number(s.state) : s.state;
    if ((typeof s.id === 'string' || typeof s.id === 'number') && typeof v === 'number' && Number.isFinite(v)) out.set(String(s.id), v);
  }
  return out;
}
