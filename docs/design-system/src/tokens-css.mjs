// tokens.css compilé depuis tokens.json (forme « tokens.css as compiled » du type).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const [src = fileURLToPath(new URL('../tokens.json', import.meta.url)), out = fileURLToPath(new URL('../tokens.css', import.meta.url))] = process.argv.slice(2);
const t = JSON.parse(fs.readFileSync(src, 'utf8'));
const theme = t.color.themes[0].id;
const val = (v) => (typeof v === 'string' ? v : v[theme]);
const colors = t.color.tokens.map((x) => `  --${x.name}: ${val(x.value)};`);
const shadows = t.shadow.tokens.map((x) => `  --${x.name}: ${val(x.value)};`);
const plain = [...t.spacing.tokens, ...t.radius.tokens].map((x) => `  --${x.name}: ${x.value};`);
const fams = Object.entries(t.type.families).map(([k, v]) => `  --font-${k}: ${v};`);
const px = (v) => (typeof v === 'number' ? `${v}px` : v);
const styles = t.type.groups.flatMap((g) => g.styles.map((s) => {
  const fam = s.family ?? g.family;
  const p = [`font-family: var(--font-${fam})`, `font-size: ${px(s.fontSize)}`];
  if (s.lineHeight !== undefined) p.push(`line-height: ${s.lineHeight}`);
  if (s.fontWeight !== undefined) p.push(`font-weight: ${s.fontWeight}`);
  if (s.letterSpacing !== undefined) p.push(`letter-spacing: ${px(s.letterSpacing)}`);
  return `.${s.name} { ${p.join('; ')}; }`;
}));
const css = `/* ${t.name} — generated from tokens.json */
:root, [data-theme="${theme}"] {
${[...colors, ...shadows].join('\n')}
}
:root {
${[...plain, ...fams].join('\n')}
}
${styles.join('\n')}
`;
fs.writeFileSync(out, css);
console.log(`tokens.css : ${colors.length} couleurs, ${shadows.length} ombres, ${plain.length} longueurs, ${styles.length} styles`);
