// Lecture et modification d'un fichier INI en conservant tout ce qu'on ne touche
// pas : commentaires, ordre, espacement, fins de ligne. Un générateur ne doit
// modifier que les clés qu'il possède.

interface Line {
  raw: string;
  section?: string;
  key?: string;
  value?: string;
}

const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/;
const ENTRY_RE = /^(\s*)([^=;#\s][^=]*?)(\s*=\s*)(.*?)\s*$/;

export class IniDocument {
  private constructor(
    private lines: Line[],
    private readonly eol: string,
    /** VPX écrit son fichier sans saut de ligne final : on garde la fin du fichier telle quelle. */
    private readonly finalEol: boolean,
  ) {}

  static parse(text: string): IniDocument {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const body = text.endsWith(eol) ? text.slice(0, -eol.length) : text;
    const lines: Line[] = [];
    let section: string | undefined;
    if (text.length > 0) {
      for (const raw of body.split(/\r?\n/)) {
        const sec = SECTION_RE.exec(raw);
        if (sec) {
          section = sec[1]!.trim();
          lines.push({ raw, section });
          continue;
        }
        const entry = ENTRY_RE.exec(raw);
        if (entry && section !== undefined) {
          lines.push({ raw, section, key: entry[2]!.trim(), value: entry[4]! });
        } else {
          lines.push({ raw, section });
        }
      }
    }
    return new IniDocument(lines, eol, text.length === 0 || text.endsWith(eol));
  }

  get(section: string, key: string): string | undefined {
    return this.findEntry(section, key)?.value;
  }

  /** Remplace la valeur en gardant la mise en forme de la ligne, ou ajoute la clé en fin de section. */
  set(section: string, key: string, value: string): void {
    const existing = this.findEntry(section, key);
    if (existing) {
      const m = ENTRY_RE.exec(existing.raw)!;
      existing.raw = `${m[1]}${m[2]}${m[3]}${value}`;
      existing.value = value;
      return;
    }

    const line: Line = { raw: `${key} = ${value}`, section, key, value };
    const headerIndex = this.lines.findIndex((l) => l.key === undefined && same(l.section, section) && SECTION_RE.test(l.raw));
    if (headerIndex === -1) {
      if (this.lines.length > 0 && this.lines.at(-1)!.raw.trim() !== '') this.lines.push({ raw: '' });
      this.lines.push({ raw: `[${section}]`, section }, line);
      return;
    }
    // Après la dernière ligne non vide de la section.
    let insertAt = headerIndex + 1;
    for (let i = headerIndex + 1; i < this.lines.length && same(this.lines[i]!.section, section); i++) {
      if (this.lines[i]!.raw.trim() !== '') insertAt = i + 1;
    }
    this.lines.splice(insertAt, 0, line);
  }

  /** Retire la clé ; retire aussi l'en-tête de section s'il ne reste plus aucune clé dedans. */
  remove(section: string, key: string): boolean {
    const entry = this.findEntry(section, key);
    if (!entry) return false;
    this.lines.splice(this.lines.indexOf(entry), 1);
    if (!this.lines.some((l) => l.key !== undefined && same(l.section, section))) {
      this.lines = this.lines.filter((l) => !same(l.section, section) || (l.raw.trim() !== '' && !SECTION_RE.test(l.raw)));
    }
    return true;
  }

  /** Toutes les clés, dans l'ordre du fichier. */
  entries(): { section: string; key: string; value: string }[] {
    return this.lines.flatMap((l) => (l.key !== undefined && l.section !== undefined ? [{ section: l.section, key: l.key, value: l.value! }] : []));
  }

  toString(): string {
    if (this.lines.length === 0) return '';
    return this.lines.map((l) => l.raw).join(this.eol) + (this.finalEol ? this.eol : '');
  }

  private findEntry(section: string, key: string): Line | undefined {
    return this.lines.find((l) => l.key !== undefined && same(l.section, section) && same(l.key, key));
  }
}

// VPX ne distingue pas la casse des sections et des clés.
function same(a: string | undefined, b: string): boolean {
  return a !== undefined && a.toLowerCase() === b.toLowerCase();
}
