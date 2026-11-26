// Plafond des effets en partie pour les LED que libdof pilote elle-même : tables à ROM (plugin DOF de VPX)
// et tables originales relayées (app/src/dof-relais.ts). Ces LED ne passent jamais par Cyber Pinball :
// libdof lit Cabinet.xml au début de la partie et parle seule au contrôleur (Teensy, Wemos D1, Art-Net).
// Le seul levier est donc le <Brightness> de chaque <LedStrip>, que libdof applique ainsi
// (libdof, LedStrip.cpp, SetOutputData) :
//
//   sortie = valeur × (Brightness / 100) ^ BrightnessGammaCorrection   (2,2 par défaut)
//
// Avant chaque partie, Cyber Pinball réécrit ce <Brightness> pour que le facteur de libdof soit celui de la
// bande décrite multiplié par le gain des effets en partie (gameLedGain : 10 % ≈ 1 % de lumière, quasi
// éteint). La luminosité décrite reste dans <CyberPinballBrightness>, que libdof ignore et que
// readCabinetXml relit : l'éditeur des bandes et le pilote des LED de Cyber Pinball n'en voient pas l'effet.
// Retour d'essai du 26/11/2026 : réglées à 10 %, les LED d'une partie à ROM restaient aveuglantes.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DOF_DESCRIBED_BRIGHTNESS, isOwnedCabinetText, type DofCabinetFile } from './dof';

/** Correction gamma que libdof applique à <Brightness> quand la bande n'en déclare pas (LedStrip.cpp). */
export const LIBDOF_BRIGHTNESS_GAMMA = 2.2;

/**
 * <Brightness> (0 à 100, entier) à écrire pour une bande décrite à `described` % quand les effets en partie
 * ont le gain linéaire `gain` (0..1) : (écrit/100)^γ = (décrit/100)^γ × gain. Jamais 0 tant que le gain et
 * la bande ne le sont pas (libdof éteindrait tout) ; gain 1 : la valeur décrite, telle quelle.
 */
export function dofStripBrightness(described: number, gain: number, gamma = LIBDOF_BRIGHTNESS_GAMMA): number {
  const d = Math.max(0, Math.min(100, Math.round(described)));
  const g = Math.max(0, Math.min(1, gain));
  if (g >= 1 || d === 0) return d;
  if (g <= 0) return 0;
  const k = Math.pow(g, 1 / Math.max(0.1, Math.min(10, gamma)));
  return Math.max(1, Math.min(d, Math.round(d * k)));
}

/** Facteur que libdof appliquera à une bande dont <Brightness> vaut `brightness` (LedStrip.cpp). */
export function libdofBrightnessFactor(brightness: number, gamma = LIBDOF_BRIGHTNESS_GAMMA): number {
  const b = Math.max(0, Math.min(100, brightness)) / 100;
  return b >= 1 ? 1 : Math.pow(b, Math.max(0.1, Math.min(10, gamma)));
}

const num = (block: string, name: string): number | undefined => {
  const m = new RegExp(`<${name}>\\s*([-+]?[0-9.]+)\\s*</${name}>`).exec(block);
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? v : undefined;
};

/**
 * Cabinet.xml (texte) avec le plafond des effets en partie posé sur chaque <LedStrip>. Idempotent ; au
 * gain 1, chaque bande retrouve sa luminosité décrite et l'élément de Cyber Pinball disparaît (texte
 * d'origine). Le reste du fichier n'est pas touché.
 */
export function withGameLedLevel(text: string, gain: number): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.replace(/<LedStrip(\s[^>]*)?>([\s\S]*?)<\/LedStrip>/g, (whole: string, attrs: string | undefined, body: string) => {
    const described = num(body, DOF_DESCRIBED_BRIGHTNESS) ?? num(body, 'Brightness') ?? 100;
    const gamma = num(body, 'BrightnessGammaCorrection') ?? LIBDOF_BRIGHTNESS_GAMMA;
    const written = dofStripBrightness(described, gain, gamma);
    const d = Math.max(0, Math.min(100, Math.round(described)));
    // Sans l'élément de Cyber Pinball : il est remis seulement si le plafond change la valeur.
    let inner = body.replace(new RegExp(`[ \\t]*<${DOF_DESCRIBED_BRIGHTNESS}>[^<]*</${DOF_DESCRIBED_BRIGHTNESS}>[ \\t]*(\\r?\\n)?`, 'g'), '');
    const keep = written !== d ? `<${DOF_DESCRIBED_BRIGHTNESS}>${d}</${DOF_DESCRIBED_BRIGHTNESS}>` : '';
    const line = /(^|\n)([ \t]*)<Brightness>[^<]*<\/Brightness>[ \t]*(\r?\n)?/.exec(inner);
    if (line) {
      const indent = line[2] ?? '';
      const after = line[3] ?? '';
      const replacement = `${line[1]}${indent}<Brightness>${written}</Brightness>${keep ? `${eol}${indent}${keep}` : ''}${after}`;
      inner = inner.slice(0, line.index) + replacement + inner.slice(line.index + line[0].length);
    } else if (written !== 100 || keep) {
      // Pas de <Brightness> : libdof prend 100. Ajouté avant la fermeture, à l'indentation des autres éléments.
      const indent = /\n([ \t]+)<\w/.exec(inner)?.[1] ?? '  ';
      const tail = /([ \t]*)$/.exec(inner)?.[1] ?? '';
      inner = `${inner.slice(0, inner.length - tail.length)}${indent}<Brightness>${written}</Brightness>${eol}${keep ? `${indent}${keep}${eol}` : ''}${tail}`;
    }
    return inner === body ? whole : `<LedStrip${attrs ?? ''}>${inner}</LedStrip>`;
  });
}

export interface DofLedLevelResult {
  /** Cabinet.xml réécrit (le plafond a changé). */
  updated: boolean;
  /** Pourquoi le plafond n'a pas pu être posé (Cabinet.xml écrit à la main, illisible). */
  refused?: string;
  /** Bandes et <Brightness> écrit, pour le journal. */
  strips: { name: string; described: number; written: number }[];
}

/**
 * Pose le plafond des effets en partie dans le Cabinet.xml que libdof va lire (seulement s'il change).
 * Un Cabinet.xml sans la marque de Cyber Pinball n'est jamais touché : refusé, avec la raison.
 */
export function applyDofLedLevel(cabinet: Pick<DofCabinetFile, 'file'> | undefined, gain: number): DofLedLevelResult {
  const result: DofLedLevelResult = { updated: false, strips: [] };
  if (!cabinet) return result;
  let text: string;
  try {
    text = fs.readFileSync(cabinet.file, 'utf8');
  } catch (error) {
    result.refused = `${path.basename(cabinet.file)}: unreadable (${(error as Error).message}).`; // i18n-ignore : journal
    return result;
  }
  if (!/<LedStrip[\s>]/.test(text)) return result;
  const wanted = withGameLedLevel(text, gain);
  const owned = isOwnedCabinetText(text);
  if (wanted !== text && !owned) {
    result.refused = `${path.basename(cabinet.file)}: hand-written, the in-game LED level cannot be applied to DOF (its <Brightness> values stay as they are).`; // i18n-ignore : journal
  }
  const final = owned ? wanted : text;
  for (const m of final.matchAll(/<LedStrip(?:\s[^>]*)?>([\s\S]*?)<\/LedStrip>/g)) {
    const body = m[1] ?? '';
    const name = /<Name>([^<]*)<\/Name>/.exec(body)?.[1]?.trim() ?? '';
    const written = num(body, 'Brightness') ?? 100;
    result.strips.push({ name, described: num(body, DOF_DESCRIBED_BRIGHTNESS) ?? written, written });
  }
  if (final === text) return result;
  fs.writeFileSync(cabinet.file, final, 'utf8');
  result.updated = true;
  return result;
}

/** Ligne de journal du plafond posé pour libdof. */
export function dofLedLevelSummary(result: DofLedLevelResult, gain: number): string {
  const strips = result.strips.map((s) => `${s.name || '?'} ${s.described} → ${s.written}`).join(', ');
  return `[dof] LED de libdof au gain des effets en partie ${(gain * 100).toFixed(1)} % : Brightness ${strips || 'aucune bande'}${result.updated ? ' (Cabinet.xml réécrit)' : ''}.`; // i18n-ignore : journal
}
