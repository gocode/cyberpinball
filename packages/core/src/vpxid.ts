// Identifiant d'une table et de ses règles de score, pour jouer ensemble d'une borne à l'autre
// (partie en direct, docs/manuel.md « Partie en direct »). Décision du 29/10/2026 : personne
// n'est refusé, seul le classement change selon ce que les deux bornes ont en commun.
//
// - Identifiant de table : l'empreinte SHA-256 de ce qui fait la table elle-même, ses objets
//   (GameStg/GameItemN : murs, rampes, flippers, formes 3D, avec leur physique), ses
//   collections et GameStg/GameData sans le script. Ni les images, ni les sons, ni les polices,
//   ni le script, ni les informations de l'auteur, la date et le numéro d'enregistrement
//   (TableInfo), ni la signature (MAC) ou la version du format. Le même identifiant survit à un
//   renommage, à un réenregistrement, à une option changée dans le script, à des images ou des
//   sons refaits. Une géométrie ou une physique changée en donne un autre ; un mod qui ajoute
//   des objets aussi (une pièce VR), même décoratifs : on ne trie pas les objets un par un.
//   Mesuré sur Game of Thrones LE VPW 1.2.1 (376 Mio) : images 222 Mio, sons 91, objets 63,
//   GameData 0,9 ; on lit 64 Mio.
// - Règles de score : pour une table à ROM PinMAME, la ROM (elle compte les points, quelle que
//   soit la table autour) ; sinon le script écrit dans la table, sans ses commentaires ni les
//   valeurs données hors des procédures (Const VRRoom = 1 : les options). Le nombre de billes
//   par partie, quand c'est une telle option, n'y est donc pas : il se compare à part (ballcount.ts).

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { CompoundFile } from './vpxinfo';

export interface VpxKeys {
  /** Identifiant de table (64 caractères hexadécimaux). */
  id?: string;
  /** Empreinte du script normalisé (scriptRulesPrint), si la table en a un lisible. */
  script?: string;
}

/** Flux de GameStg qui ne font pas la table : médias, signature, version du format. */
const SKIPPED = /^(Image|Sound|Font)\d+$|^(MAC|Version)$/;

/** Rend la main au menu entre deux flux : la lecture dure, l'interface ne doit pas geler. */
const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Identifiant de table et empreinte des règles écrites dans son script ; {} si le fichier n'est
 * pas un .vpx lisible. Lit les objets, jamais les images ni les sons.
 */
export async function readVpxKeys(file: string): Promise<VpxKeys> {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const game = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === 'GameStg');
    if (!game) return {};
    const streams = cfb
      .children(game)
      .filter((e) => e.type === 2 && !SKIPPED.test(e.name))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const hash = createHash('sha256');
    let script: string | undefined;
    let found = false;
    for (const [i, entry] of streams.entries()) {
      let data = cfb.stream(entry);
      if (entry.name === 'GameData') {
        const split = withoutScript(data);
        data = split.rest;
        if (split.script !== undefined) script = scriptRulesPrint(split.script);
        found = true;
      }
      hash.update(`${entry.name}\0${data.length}\0`);
      hash.update(data);
      if (i % 64 === 63) await breathe();
    }
    return found ? { id: hash.digest('hex'), ...(script ? { script } : {}) } : {};
  } catch {
    return {};
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * GameData sans l'enregistrement CODE (longueur 4, puis la longueur du texte et le texte, hors
 * de sa longueur : BiffReader::AsScript) ; le texte à part, sauf s'il est protégé.
 */
function withoutScript(data: Buffer): { rest: Buffer; script?: string } {
  let pos = 0;
  let locked = false;
  while (pos + 8 <= data.length) {
    const size = data.readUInt32LE(pos);
    const tag = data.toString('latin1', pos + 4, pos + 8);
    if (size < 4) break;
    if (tag === 'SECB') locked = true;
    if (tag === 'CODE' && pos + 12 <= data.length) {
      const length = data.readUInt32LE(pos + 8);
      const end = Math.min(data.length, pos + 12 + length);
      return { rest: Buffer.concat([data.subarray(0, pos), data.subarray(end)]), ...(locked ? {} : { script: data.toString('latin1', pos + 12, end) }) };
    }
    if (tag === 'ENDB') break;
    pos += 4 + size;
  }
  return { rest: data };
}

/** Une valeur écrite telle quelle : nombre, booléen, chaîne, couleur. */
const LITERAL = /^(-?\s*(&h[0-9a-f]+&?|\d+(\.\d*)?(e[+-]?\d+)?|\.\d+)|true|false|"[^"]*"|nothing|empty|null)$/;

/**
 * Empreinte des règles écrites dans un script VBScript : sans commentaires, casse ni espaces,
 * et sans les valeurs données hors des procédures (« Const VRRoom = 1 », « LUTset = 3 » : les
 * options que chacun règle chez lui). Deux scripts qui ne diffèrent que par là ont les mêmes
 * règles ; une procédure changée en fait d'autres.
 */
export function scriptRulesPrint(text: string): string {
  const out: string[] = [];
  let depth = 0;
  for (const raw of text.split(/\r?\n/)) {
    for (let statement of statements(withoutComment(raw))) {
      statement = statement.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!statement) continue;
      if (/^end (sub|function|property)\b/.test(statement)) depth = Math.max(0, depth - 1);
      else if (/^((public|private) )?(default )?(sub|function|property (get|let|set)) /.test(statement)) depth++;
      else if (depth === 0) {
        const value = /^((?:(?:public|private) )?(?:const )?[a-z_][a-z0-9_.]*(?:\(\d+\))? ?= ?)(.+)$/.exec(statement);
        if (value && LITERAL.test(value[2]!.trim())) statement = `${value[1]!.replace(/ /g, '')}?`;
      }
      out.push(statement);
    }
  }
  return createHash('sha256').update(out.join('\n')).digest('hex');
}

/** La ligne sans son commentaire (« ' » ou « Rem » hors d'une chaîne). */
function withoutComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inString = !inString;
    else if (!inString && c === "'") return line.slice(0, i);
    else if (!inString && /^rem\b/i.test(line.slice(i)) && (i === 0 || /[\s:]/.test(line[i - 1]!))) return line.slice(0, i);
  }
  return line;
}

/** Instructions d'une ligne, séparées par « : » hors des chaînes. */
function statements(line: string): string[] {
  const out: string[] = [];
  let inString = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inString = !inString;
    else if (!inString && line[i] === ':') {
      out.push(line.slice(start, i));
      start = i + 1;
    }
  }
  out.push(line.slice(start));
  return out;
}

/**
 * Clé des règles de score : la ROM PinMAME quand la table en joue une (en minuscules, triées),
 * sinon l'empreinte des règles de son script ; undefined si on ne sait pas.
 */
export function rulesKey(roms: readonly string[], script: string | undefined): string | undefined {
  const named = [...new Set(roms.map((r) => r.trim().toLowerCase()).filter(Boolean))].sort();
  if (named.length) return `rom:${named.join(',')}`.slice(0, 200);
  return script ? `vbs:${script}` : undefined;
}
