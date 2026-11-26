// Remplacement du DOF d'une table : le joueur veut, pour cette table, exactement les effets de Cyber Pinball
// (le moteur « Effets LED sans DOF » : dégradés, comète au lancer, couleurs du thème) sur ses bandes de LED,
// pas la config DOF communautaire (The Matrix : toutes les bandes en jaune), ni des lignes DOF de repli sur
// les mêmes déclencheurs (essayé en 0.2.4-essai.56 : « ça reste toujours sur le DOF »).
//
// Pendant une partie VPX, libdof lit Cabinet.xml (écrit par Cyber Pinball) et ouvre le port série des
// contrôleurs qu'il décrit, dès qu'une ROM démarre. Pour la partie d'une table en remplacement, Cabinet.xml
// garde en sommeil, dans des commentaires XML marqués que libdof ne lit pas :
// - les bandes (toys LedStrip) et le contrôleur qui les pilote (Teensy, Wemos…) : libdof n'ouvre pas son
//   port, que le moteur de Cyber Pinball garde pour la partie ;
// - les sorties des LedWizEquivalent qui visent ces bandes (une colonne d'ini dont la sortie manque est
//   ignorée : Configurator.cpp, SetupCabinet) ;
// les autres toys (contacteurs, moteurs, lampes, LED RGB) restent à DOF. Un contrôleur qui pilote aussi
// autre chose que des bandes n'est jamais mis en sommeil : remplacement refusé, la table garde son DOF.
// Hors de cette partie, tout est rendu tel quel (octet pour octet), et Cyber Pinball lit toujours
// Cabinet.xml rendu (readCabinetXml) : l'éditeur des bandes et le moteur ne voient jamais le sommeil.

// ---------------------------------------------------------------------------
// Choix d'une table (.info, CyberPinball.dofReplace)
// ---------------------------------------------------------------------------

/** La table remplace-t-elle sa config DOF (bandes de LED) par les effets de Cyber Pinball ? */
export function dofReplaceOf(info: { [key: string]: unknown }): boolean {
  const own = info.CyberPinball as { dofReplace?: unknown } | undefined;
  return own?.dofReplace === true;
}

/** Le .info avec ce choix (false : la config DOF de la table), les autres champs conservés. */
export function withDofReplace<T extends { [key: string]: unknown }>(info: T, on: boolean): T {
  const own: Record<string, unknown> = { ...(info.CyberPinball as Record<string, unknown> | undefined) };
  if (on) own.dofReplace = true;
  else delete own.dofReplace;
  const next: Record<string, unknown> = { ...info };
  if (Object.keys(own).length) next.CyberPinball = own;
  else delete next.CyberPinball;
  return next as T;
}

// ---------------------------------------------------------------------------
// Bandes, contrôleur et sorties mis en sommeil dans Cabinet.xml
// ---------------------------------------------------------------------------

/** Marque du commentaire qui garde un élément en sommeil (lue par Cyber Pinball seulement). */
export const DOF_REPLACE_MARK = 'Cyber Pinball DOF replacement:'; // i18n-ignore : fichier lu par DOF
// « -- » est écrit « -&#45; » dans le commentaire : « --> » n'y apparaît donc jamais avant sa fin.
const ASLEEP = /<!-- Cyber Pinball DOF replacement: ([\s\S]*?) -->/g;
const TAG = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/([\w.:-]+)\s*>|<([\w.:-]+)(?:\s[^>]*?)?(\/?)>/g;

const xmlText = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

const toComment = (block: string) => `<!-- ${DOF_REPLACE_MARK} ${block.replace(/--/g, '-&#45;')} -->`;
const fromComment = (block: string) => block.replace(/-&#45;/g, '--');

/** Cabinet.xml a-t-il des éléments en sommeil ? */
export function hasDofSleep(xml: string): boolean {
  ASLEEP.lastIndex = 0;
  return ASLEEP.test(xml);
}

/** Cabinet.xml rendu, exactement comme avant la mise en sommeil. */
export function restoreDofSleep(xml: string): string {
  return xml.replace(ASLEEP, (_m, block: string) => fromComment(block));
}

interface XmlElement {
  name: string;
  start: number;
  end: number;
  /** Contenu entre la balise ouvrante et la fermante. */
  inner: [number, number];
}

/** Éléments enfants directs (commentaires ignorés) de xml[from, to). */
function elementsIn(xml: string, from = 0, to = xml.length): XmlElement[] {
  const out: XmlElement[] = [];
  const re = new RegExp(TAG.source, 'g');
  re.lastIndex = from;
  let depth = 0;
  let open: { name: string; start: number; innerStart: number } | undefined;
  for (let m = re.exec(xml); m && m.index < to; m = re.exec(xml)) {
    const [whole, close, name, selfClosing] = m;
    if (close) {
      depth--;
      if (depth < 0) break;
      if (depth === 0 && open) {
        out.push({ name: open.name, start: open.start, end: m.index + whole.length, inner: [open.innerStart, m.index] });
        open = undefined;
      }
    } else if (name) {
      if (selfClosing) {
        if (depth === 0) out.push({ name, start: m.index, end: m.index + whole.length, inner: [m.index + whole.length, m.index + whole.length] });
        continue;
      }
      if (depth === 0) open = { name, start: m.index, innerStart: m.index + whole.length };
      depth++;
    }
  }
  return out;
}

const childrenOf = (xml: string, el: XmlElement | undefined) => (el ? elementsIn(xml, el.inner[0], el.inner[1]) : []);
const textOf = (xml: string, el: XmlElement) => xml.slice(el.inner[0], el.inner[1]);
const valueOf = (xml: string, el: XmlElement, name: string) => {
  const c = childrenOf(xml, el).find((e) => e.name === name);
  return c ? xmlText(textOf(xml, c)) : undefined;
};

function cabinetParts(xml: string) {
  const root = elementsIn(xml).find((e) => e.name === 'Cabinet');
  const parts = childrenOf(xml, root);
  return { root, controllers: parts.find((e) => e.name === 'OutputControllers'), toys: parts.find((e) => e.name === 'Toys') };
}

export interface DofSleepController {
  type: string;
  name: string;
  port?: string;
}

export interface DofSleep {
  /** Cabinet.xml à écrire pour la partie (inchangé si refusé). */
  xml: string;
  controllers: DofSleepController[];
  strips: string[];
  /** Sorties des LedWizEquivalent qui visaient ces bandes. */
  outputs: { equivalent: number; output: number; name: string }[];
  /** Pourquoi le remplacement est impossible (la table garde son DOF). */
  refused?: string;
}

/**
 * Cabinet.xml où ces bandes, leur(s) contrôleur(s) et les sorties LedWiz qui les visent sont en sommeil.
 * Refusé (rien en sommeil) si un contrôleur des bandes pilote aussi un autre toy, ou si un autre toy vise
 * une bande. Idempotent : un sommeil précédent est rendu d'abord.
 */
export function sleepDofStrips(xml: string, stripNames: string[]): DofSleep {
  const base = restoreDofSleep(xml);
  const refuse = (refused: string): DofSleep => ({ xml: base, controllers: [], strips: [], outputs: [], refused });
  const wanted = new Set(stripNames.map((s) => s.trim()).filter(Boolean));
  if (!wanted.size) return refuse('no LED strip described'); // i18n-ignore : journal
  const parts = cabinetParts(base);
  if (!parts.root) return refuse('no <Cabinet> element'); // i18n-ignore : journal
  const toys = childrenOf(base, parts.toys);
  const stripToys = toys.filter((t) => t.name === 'LedStrip' && wanted.has(valueOf(base, t, 'Name') ?? ''));
  if (!stripToys.length) return refuse(`no LedStrip toy named ${[...wanted].join(', ')}`); // i18n-ignore : journal
  const strips = stripToys.map((t) => valueOf(base, t, 'Name')!);
  const controllerNames = new Set(stripToys.map((t) => valueOf(base, t, 'OutputControllerName')).filter((n): n is string => Boolean(n)));
  const controllers = childrenOf(base, parts.controllers).filter((c) => controllerNames.has(valueOf(base, c, 'Name') ?? c.name));
  const asleep = new Set([...strips, ...controllerNames]);
  // Un autre toy qui vise une bande ou un contrôleur en sommeil (OutputControllerName, OutputName « Teensy.01 »…) : refus.
  for (const toy of toys) {
    if (stripToys.includes(toy) || toy.name === 'LedWizEquivalent') continue;
    const refs = [...textOf(base, toy).matchAll(/<(\w*Name\w*)>([\s\S]*?)<\/\1>/g)].filter(([, tag]) => tag !== 'Name').map(([, , v]) => xmlText(v ?? ''));
    const hit = refs.find((r) => asleep.has(r) || [...controllerNames].some((c) => r.startsWith(`${c}.`)));
    if (hit) return refuse(`toy ${toy.name} "${valueOf(base, toy, 'Name') ?? '?'}" also uses ${hit}`); // i18n-ignore : journal
  }
  const blocks: [number, number][] = [...controllers, ...stripToys].map((e) => [e.start, e.end]);
  const outputs: DofSleep['outputs'] = [];
  for (const eq of toys.filter((t) => t.name === 'LedWizEquivalent')) {
    const equivalent = Number(valueOf(base, eq, 'LedWizNumber') ?? 0);
    const list = childrenOf(base, eq).find((e) => e.name === 'Outputs');
    for (const o of childrenOf(base, list).filter((e) => e.name === 'LedWizEquivalentOutput')) {
      const name = valueOf(base, o, 'OutputName') ?? '';
      if (!strips.includes(name)) continue;
      outputs.push({ equivalent, output: Number(valueOf(base, o, 'LedWizEquivalentOutputNumber') ?? 0), name });
      blocks.push([o.start, o.end]);
    }
  }
  let next = base;
  for (const [start, end] of blocks.sort((a, b) => b[0] - a[0])) next = next.slice(0, start) + toComment(next.slice(start, end)) + next.slice(end);
  return {
    xml: next,
    controllers: controllers.map((c) => {
      const port = valueOf(base, c, 'ComPortName');
      return { type: c.name, name: valueOf(base, c, 'Name') ?? c.name, ...(port ? { port } : {}) };
    }),
    strips,
    outputs,
  };
}

/** Ce qui est en sommeil, pour le journal : « contrôleur Teensy (TeensyStripController, COM3), bandes A, B, 4 sortie(s) LedWiz (30:1…) ». */
export function dofSleepSummary(s: DofSleep): string {
  const controllers = s.controllers.map((c) => `${c.name} (${c.type}${c.port ? `, ${c.port}` : ''})`).join(', ');
  const outputs = s.outputs.map((o) => `${o.equivalent}:${o.output}`).join(', ');
  return `contrôleur ${controllers || 'aucun'}, bandes ${s.strips.join(', ')}, ${s.outputs.length} sortie(s) LedWiz${outputs ? ` (${outputs})` : ''}`; // i18n-ignore : journal
}

export interface DofLiveLeds {
  controllers: string[];
  strips: string[];
  equivalents: { number: number; outputs: { number: number; name: string }[] }[];
}

/** Ce que libdof lit vraiment de Cabinet.xml (éléments en sommeil absents) : pour le journal et les essais. */
export function libdofCabinet(xml: string): DofLiveLeds {
  const parts = cabinetParts(xml);
  const toys = childrenOf(xml, parts.toys);
  return {
    controllers: childrenOf(xml, parts.controllers).map((c) => valueOf(xml, c, 'Name') ?? c.name),
    strips: toys.filter((t) => t.name === 'LedStrip').map((t) => valueOf(xml, t, 'Name') ?? ''),
    equivalents: toys
      .filter((t) => t.name === 'LedWizEquivalent')
      .map((eq) => ({
        number: Number(valueOf(xml, eq, 'LedWizNumber') ?? 0),
        outputs: childrenOf(xml, childrenOf(xml, eq).find((e) => e.name === 'Outputs'))
          .filter((e) => e.name === 'LedWizEquivalentOutput')
          .map((o) => ({ number: Number(valueOf(xml, o, 'LedWizEquivalentOutputNumber') ?? 0), name: valueOf(xml, o, 'OutputName') ?? '' })),
      })),
  };
}
