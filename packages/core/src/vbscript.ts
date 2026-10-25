// Lecture du texte d'un script de table (VBScript), sans l'exécuter : commentaires
// retirés, lignes gardées à leur place pour qu'un numéro de ligne trouvé dans le
// code désigne la même ligne dans le script d'origine.

/** Position du commentaire d'une ligne (apostrophe hors chaîne, ou Rem en tête) ; -1 s'il n'y en a pas. */
export function commentStart(line: string): number {
  if (/^\s*rem\b/i.test(line)) return 0;
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inString = !inString;
    else if (c === "'" && !inString) return i;
  }
  return -1;
}

/** Retire le commentaire VBScript d'une ligne (apostrophe hors chaîne, ou Rem). */
export function stripComment(line: string): string {
  const at = commentStart(line);
  return at < 0 ? line : line.slice(0, at);
}

/** Le script sans ses commentaires, une ligne pour une ligne (séparées par \n). */
export function scriptCode(vbs: string): string {
  return vbs.split(/\r?\n/).map(stripComment).join('\n');
}

/** Instructions d'une ligne de code séparées par « : » (hors chaînes). */
export function statements(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inString = false;
  for (const c of line) {
    if (c === '"') inString = !inString;
    if (c === ':' && !inString) {
      out.push(current);
      current = '';
    } else current += c;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}
