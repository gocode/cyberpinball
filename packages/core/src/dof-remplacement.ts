// Remplacement du DOF d'une table : le joueur préfère les effets de Cyber Pinball à la config DOF
// communautaire de la table (The Matrix : toutes les bandes en jaune). Pendant une partie VPX, c'est libdof
// qui lit la config ; on ne peut ni retirer la ligne de la ROM d'un ini du configtool (libdof garde une ligne
// par ini, au meilleur rang de correspondance), ni écrire dans ces ini qui ne sont pas à nous. Le levier est
// Cabinet.xml, écrit par Cyber Pinball et relu par libdof à chaque partie : une colonne d'ini dont la sortie
// manque au LedWizEquivalent est ignorée (Configurator.cpp, SetupCabinet : FindByNumber nul, aucun toy).
//
// Pour la partie d'une table en remplacement :
// - les sorties des bandes de LED des LedWizEquivalent du configtool sont mises en sommeil dans un
//   commentaire XML marqué, que libdof ne lit pas ; les autres sorties (solénoïdes, contacteurs, lampes,
//   LED RGB) restent : ces toys suivent toujours la config d'origine ;
// - directoutputconfig99.ini (dof-repli.ts) donne aux bandes les effets de Cyber Pinball pour cette ROM,
//   même si sa config était riche.
// Hors de cette partie, les sorties sont rendues telles quelles (octet pour octet), et Cyber Pinball lit
// toujours Cabinet.xml sorties rendues (readCabinetXml) : l'éditeur des bandes ne voit jamais le sommeil.

import { DOF_FALLBACK_NUMBER, type DofEquivalentOutputs } from './dof-repli';

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
// Sorties des bandes mises en sommeil dans Cabinet.xml
// ---------------------------------------------------------------------------

/** Marque du commentaire qui garde une sortie en sommeil (lue par Cyber Pinball seulement). */
export const DOF_REPLACE_MARK = 'Cyber Pinball DOF replacement:'; // i18n-ignore : fichier lu par DOF
const SUSPENDED = /<!-- Cyber Pinball DOF replacement: (<LedWizEquivalentOutput>[\s\S]*?<\/LedWizEquivalentOutput>) -->/g;
const EQUIVALENT = /<LedWizEquivalent(?:\s[^>]*)?>[\s\S]*?<\/LedWizEquivalent>/g;
const OUTPUT = /<LedWizEquivalentOutput>[\s\S]*?<\/LedWizEquivalentOutput>/g;

const xmlText = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

// Un commentaire XML ne contient pas « -- » : écrit « -&#45; » dedans, rendu tel quel au réveil.
const toComment = (block: string) => `<!-- ${DOF_REPLACE_MARK} ${block.replace(/--/g, '-&#45;')} -->`;
const fromComment = (block: string) => block.replace(/-&#45;/g, '--');

/** Cabinet.xml a-t-il des sorties en sommeil ? */
export function hasSuspendedStripOutputs(xml: string): boolean {
  SUSPENDED.lastIndex = 0;
  return SUSPENDED.test(xml);
}

/** Cabinet.xml sorties rendues, exactement comme avant leur mise en sommeil. */
export function restoreStripOutputs(xml: string): string {
  return xml.replace(SUSPENDED, (_m, block: string) => fromComment(block));
}

export interface SuspendedOutput {
  equivalent: number;
  output: number;
  name: string;
}

/**
 * Cabinet.xml dont les sorties de ces bandes sont en sommeil dans tous les LedWizEquivalent, sauf celui
 * du repli (99) ; stripNames vide : toutes rendues. Idempotent.
 */
export function suspendStripOutputs(xml: string, stripNames: string[]): { xml: string; suspended: SuspendedOutput[] } {
  const base = restoreStripOutputs(xml);
  const suspended: SuspendedOutput[] = [];
  const strips = new Set(stripNames.map((s) => s.trim()));
  if (!strips.size) return { xml: base, suspended };
  const next = base.replace(EQUIVALENT, (block) => {
    const equivalent = Number(/<LedWizNumber>\s*(\d+)\s*<\/LedWizNumber>/.exec(block)?.[1] ?? 0);
    if (equivalent === DOF_FALLBACK_NUMBER) return block;
    return block.replace(OUTPUT, (o) => {
      const name = /<OutputName>([\s\S]*?)<\/OutputName>/.exec(o)?.[1];
      if (name === undefined || !strips.has(xmlText(name))) return o;
      suspended.push({ equivalent, output: Number(/<LedWizEquivalentOutputNumber>\s*(\d+)\s*</.exec(o)?.[1] ?? 0), name: xmlText(name) });
      return toComment(o);
    });
  });
  return { xml: next, suspended };
}

/** LedWizEquivalent tels que libdof les lit (sorties en sommeil absentes) : pour le journal et les essais. */
export function libdofEquivalents(xml: string): DofEquivalentOutputs[] {
  const live = xml.replace(/<!--[\s\S]*?-->/g, '');
  return [...live.matchAll(EQUIVALENT)].map(([block]) => ({
    number: Number(/<LedWizNumber>\s*(\d+)\s*<\/LedWizNumber>/.exec(block)?.[1] ?? 0),
    outputs: [...block.matchAll(OUTPUT)].map(([o]) => ({
      number: Number(/<LedWizEquivalentOutputNumber>\s*(\d+)\s*</.exec(o)?.[1] ?? 0),
      name: xmlText(/<OutputName>([\s\S]*?)<\/OutputName>/.exec(o)?.[1] ?? ''),
    })),
  }));
}
