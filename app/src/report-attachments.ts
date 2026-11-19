// Pièces jointes d'un rapport aux développeurs : des fichiers de ce PC (capture d'écran, journal,
// réglages d'une table), choisis dans le sélecteur de fichiers de Cyber Pinball, aux flippers, à la
// souris ou au clavier. Ils partent dans le rapport chiffré, lu par l'équipe seule : jamais dans une
// proposition publique.
//   - Limites : ATTACHMENTS_COUNT_MAX fichiers et ATTACHMENTS_BYTES_MAX en tout, pour que le rapport
//     scellé tienne sous REPORT_SEALED_MAX avec le rapport technique. Une image lourde (capture en
//     4K) est réduite en JPEG plutôt que refusée.
//   - Seul le nom du fichier part, jamais son chemin : il contient le nom du compte Windows.
//   - Dans le ZIP du rapport : le dossier pieces-jointes/, que la fenêtre de gestion des retours
//     montre avec les autres fichiers.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatSize, REPORT_SEALED_MAX, t, tn, zipBuffers } from '@cyberpinball/core';

export const ATTACHMENTS_COUNT_MAX = 5;
/** 1,2 Mo tels que formatSize les écrit (1 Mo = 1 048 576 octets). */
export const ATTACHMENTS_BYTES_MAX = Math.round(1.2 * 1024 * 1024);
/** Dossier des pièces jointes dans le ZIP du rapport. */
export const ATTACHMENTS_FOLDER = 'pieces-jointes'; // i18n-ignore : dossier du ZIP, lu par l'équipe
/** Images que la réduction sait lire (Electron nativeImage). */
export const SHRINKABLE_EXTENSIONS = ['png', 'jpg', 'jpeg'];
/** Une image plus lourde est réduite même si elle tient : la place reste aux autres fichiers. */
const SHRINK_FROM = 300_000;
/** Au-delà, une image n'est pas même ouverte pour la réduire. */
const SHRINK_SOURCE_MAX = 80_000_000;
/** Place gardée dans le rapport scellé pour son en-tête (le texte du joueur, le chiffrement). */
const ENVELOPE_ROOM = 64_000;

export interface Attachment {
  /** Nom du fichier seul, jamais son chemin. */
  name: string;
  data: Buffer;
  /** Image réduite en JPEG pour tenir. */
  shrunk?: boolean;
}

export interface AttachRefusal {
  file: string;
  why: 'count' | 'size' | 'read' | 'folder';
  size?: number;
}

/** Réduit une image (JPEG, 1920 pixels de large au plus) ; undefined si elle n'est pas lisible. */
export type ShrinkImage = (file: string) => Buffer | undefined;

export function attachmentsSize(list: readonly Attachment[]): number {
  return list.reduce((n, a) => n + a.data.length, 0);
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|bmp|gif|webp)$/i.test(name);
}

function uniqueName(name: string, list: readonly Attachment[]): string {
  const taken = new Set(list.map((a) => a.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Ajoute ces fichiers aux pièces jointes, dans les limites ; ce qui ne passe pas est rendu dans
 * `refused` (trop de fichiers, trop lourd, illisible, un dossier), le reste est gardé.
 */
export function addAttachments(list: readonly Attachment[], files: readonly string[], shrink?: ShrinkImage): { list: Attachment[]; refused: AttachRefusal[] } {
  const out = [...list];
  const refused: AttachRefusal[] = [];
  for (const file of files) {
    const base = path.basename(file);
    if (out.length >= ATTACHMENTS_COUNT_MAX) {
      refused.push({ file: base, why: 'count' });
      continue;
    }
    let size: number;
    try {
      const st = fs.statSync(file);
      if (!st.isFile()) {
        refused.push({ file: base, why: 'folder' });
        continue;
      }
      size = st.size;
    } catch {
      refused.push({ file: base, why: 'read' });
      continue;
    }
    const room = ATTACHMENTS_BYTES_MAX - attachmentsSize(out);
    let name = base;
    let data: Buffer | undefined;
    let shrunk = false;
    const ext = path.extname(base);
    if (shrink && size > SHRINK_FROM && size <= SHRINK_SOURCE_MAX && SHRINKABLE_EXTENSIONS.includes(ext.slice(1).toLowerCase())) {
      let small: Buffer | undefined;
      try {
        small = shrink(file);
      } catch {
        small = undefined;
      }
      if (small?.length && small.length < size) {
        data = small;
        shrunk = true;
        name = `${base.slice(0, base.length - ext.length)}.jpg`;
      }
    }
    if (!data) {
      if (size > room) {
        refused.push({ file: base, why: 'size', size });
        continue;
      }
      try {
        // lecture entière : taille vérifiée juste au-dessus (room)
        data = fs.readFileSync(file);
      } catch {
        refused.push({ file: base, why: 'read' });
        continue;
      }
    }
    if (data.length > room) {
      refused.push({ file: base, why: 'size', size: data.length });
      continue;
    }
    out.push({ name: uniqueName(name, out), data, ...(shrunk ? { shrunk: true } : {}) });
  }
  return { list: out, refused };
}

/** Ce qui n'a pas été joint, en une ligne : le premier refus, et le nombre des autres. */
export function refusalText(refused: readonly AttachRefusal[]): { text: string; detail: string } | undefined {
  const first = refused[0];
  if (!first) return undefined;
  const text =
    first.why === 'count'
      ? t('« {file} » non joint : {n} fichiers au plus', { file: first.file, n: ATTACHMENTS_COUNT_MAX })
      : first.why === 'size'
        ? t('« {file} » trop lourd ({size})', { file: first.file, size: formatSize(first.size ?? 0) })
        : first.why === 'folder'
          ? t('« {file} » est un dossier : choisissez des fichiers', { file: first.file })
          : t('« {file} » illisible', { file: first.file });
  const others = refused.length - 1;
  const limits = t('{n} fichiers et {max} en tout au plus ; les captures d’écran sont réduites', { n: ATTACHMENTS_COUNT_MAX, max: formatSize(ATTACHMENTS_BYTES_MAX) });
  return { text, detail: others ? `${tn(others, '{n} autre fichier non joint', '{n} autres fichiers non joints')} · ${limits}` : limits };
}

/** Les pièces jointes telles qu'elles entrent dans le ZIP du rapport. */
export function attachmentMembers(list: readonly Attachment[]): { name: string; data: Buffer }[] {
  return list.map((a) => ({ name: `${ATTACHMENTS_FOLDER}/${a.name}`, data: a.data }));
}

/**
 * Le fichier du rapport : le rapport technique avec les pièces jointes, ou elles seules (pas de
 * rapport technique demandé, ou plus de place pour lui : `dropped`).
 */
export function reportFile(tech: (files: { name: string; data: Buffer }[]) => Buffer | undefined, withTech: boolean, list: readonly Attachment[]): { file?: Buffer; dropped?: boolean } {
  const members = attachmentMembers(list);
  const full = withTech ? tech(members) : undefined;
  if (full && (full.length <= REPORT_SEALED_MAX - ENVELOPE_ROOM || !members.length)) return { file: full };
  if (!members.length) return {};
  return { file: zipBuffers(members), ...(full ? { dropped: true } : {}) };
}
