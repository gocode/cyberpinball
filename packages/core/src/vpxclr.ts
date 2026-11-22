// Les objets COM de mscorlib (ArrayList, SortedList, Queue, Stack...) demandent par défaut le CLR2.
// Sur Windows avec seulement .NET4, leur création échoue (0x80131700), même si la classe est inscrite.
// Politique de l'hôte natif, pas un remplacement des objets ni une modification de Windows :
// https://learn.microsoft.com/en-us/dotnet/framework/deployment/in-process-side-by-side-execution
// (« Scenario 3 »). Conserve les vraies API et les autres réglages du fichier de l'application.
import * as fs from 'node:fs';
import { writeFileAtomic } from './atomicwrite';
import { readWholeFile } from './boundedread';
import { parseXml } from './dof';

interface Span {
  name: string;
  from: number;
  openEnd: number;
  close: number;
  to: number;
  children: Span[];
}

/** Repères dans le XML validé, pour garder les autres sections et les commentaires octet pour octet. */
function spans(text: string): Span[] {
  const roots: Span[] = [];
  const stack: Span[] = [];
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w.:-]+(?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>|[^<]+/g;
  let end = 0;
  for (const token of text.matchAll(tokens)) {
    if (token.index !== end) throw new Error('Invalid application XML'); // i18n-ignore : erreur technique
    end = token.index + token[0].length;
    const tag = token[0];
    if (tag.startsWith('</')) {
      const node = stack.pop()!;
      node.close = token.index;
      node.to = end;
    } else if (/^<[\w]/.test(tag)) {
      const node: Span = { name: /^<([^\s/>]+)/.exec(tag)![1]!, from: token.index, openEnd: end, close: end, to: end, children: [] };
      (stack.at(-1)?.children ?? roots).push(node);
      if (!tag.endsWith('/>')) stack.push(node);
    }
  }
  if (end !== text.length || stack.length) throw new Error('Invalid application XML'); // i18n-ignore : erreur technique
  return roots;
}

/** Configuration CLR de l'exécutable : .NET4 en premier, activation des anciens objets COM autorisée. */
export function vpxClrConfig(original?: string): string {
  const text = original ?? '<?xml version="1.0" encoding="utf-8"?>\r\n<configuration>\r\n</configuration>\r\n';
  const xml = parseXml(text);
  if (xml.children.length !== 1 || xml.children[0]!.name !== 'configuration') throw new Error('Expected application configuration'); // i18n-ignore : erreur technique
  const root = spans(text)[0]!;
  const startups = root.children.filter((node) => node.name === 'startup');
  if (startups.length > 1) throw new Error('Duplicate startup configuration'); // i18n-ignore : erreur technique
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const runtime = '<supportedRuntime version="v4.0" />';
  const start = startups[0];
  if (!start) {
    const block = `  <startup useLegacyV2RuntimeActivationPolicy="true">${eol}    ${runtime}${eol}  </startup>${eol}`;
    if (text.slice(root.from, root.openEnd).endsWith('/>')) return text.slice(0, root.openEnd - 2) + `>${eol}${block}</configuration>` + text.slice(root.to);
    return text.slice(0, root.close) + block + text.slice(root.close);
  }
  let open = text.slice(start.from, start.openEnd).replace(/\s*\/?>$/, '>');
  let hasPolicy = false;
  open = open.replace(/\s+([\w.:-]+)\s*=\s*(?:"[^"]*"|'[^']*')/g, (attribute, name: string) => {
    if (name !== 'useLegacyV2RuntimeActivationPolicy') return attribute;
    hasPolicy = true;
    return ' useLegacyV2RuntimeActivationPolicy="true"';
  });
  if (!hasPolicy) open = open.replace(/>$/, ' useLegacyV2RuntimeActivationPolicy="true">');
  const startXml = xml.children[0]!.children.find((node) => node.name === 'startup')!;
  const runtimes = start.children.filter((node) => node.name === 'supportedRuntime');
  const runtimeXml = startXml.children.filter((node) => node.name === 'supportedRuntime');
  // Une configuration déjà correcte est laissée identique (date comprise), même avec d'autres runtimes en secours.
  if (startXml.attrs.useLegacyV2RuntimeActivationPolicy === 'true' && runtimeXml[0]?.attrs.version === 'v4.0') return text;
  let body = text.slice(start.openEnd, start.close);
  for (let i = runtimes.length - 1; i >= 0; i--) {
    if (runtimeXml[i]?.attrs.version !== 'v4.0') continue;
    const node = runtimes[i]!;
    body = body.slice(0, node.from - start.openEnd) + body.slice(node.to - start.openEnd);
  }
  const replacement = `${open}${eol}    ${runtime}${body}${body.endsWith('\n') ? '' : eol}  </startup>`;
  return text.slice(0, start.from) + replacement + text.slice(start.to);
}

/** Posé avant tout lancement, y compris une installation existante après une mise à jour. */
export function ensureVpxClr(exe: string): boolean {
  const file = `${exe}.config`;
  let old: string | undefined;
  let encoding: BufferEncoding = 'utf8';
  try {
    const bytes = readWholeFile(file, 1024 * 1024);
    if (bytes[0] === 255 && bytes[1] === 254) encoding = 'utf16le';
    old = bytes.toString(encoding);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const content = vpxClrConfig(old);
  if (content === old) return false;
  parseXml(content);
  spans(content);
  // Ne crée pas un dossier pour un VPX absent (désinstallation ou mauvais chemin).
  if (!fs.existsSync(exe)) throw new Error('VPX executable missing'); // i18n-ignore : erreur technique
  writeFileAtomic(file, content, { encoding });
  return true;
}
