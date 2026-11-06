// Contrôle avant publication : le dépôt est public (github.com/gocode/cyberpinball), rien
// de personnel ni de secret ne doit y partir.
//   node scripts/audit-publication.mjs                 -> fichiers suivis par git
//   node scripts/audit-publication.mjs --commits <a..b> -> aussi les messages et auteurs de ces commits
//
// Refusés : clés privées, jetons (GitHub, OpenAI, AWS, Slack, Google), mots de passe écrits
// en clair, chemins d'un profil Windows (C:\Users\<nom>), adresses e-mail hors de la liste
// ci-dessous, et les noms de la liste privée %USERPROFILE%\.cyberpinball\audit-noms.txt
// (un par ligne ; hors du dépôt, sinon elle les publierait elle-même ; CYBERPINBALL_AUDIT_NOMS
// la remplace). Lancé par npm test et par scripts/publier.mjs.
//
// Documents de travail internes (isPrivate) : suivis par git sur ce poste, jamais publiés.
// L'instantané envoyé sur GitHub les retire (scripts/envoyer-github.mjs) ; un fichier publié
// ne doit pas leur faire de lien, qui serait cassé sur GitHub (refusé ici).

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Adresses publiques attendues : co-auteur des commits, auteur d'une police, exemples. */
const ALLOWED_EMAILS = [/^noreply@anthropic\.com$/i, /@users\.noreply\.github\.com$/i, /^astigma@astigmatic\.com$/i, /@example\.(org|com|net)$/i];
/** Fichiers de tiers dont les adresses sont publiques : licences des polices, métadonnées npm. */
const THIRD_PARTY = /(^|\/)(OFL|LICENSE)[^/]*$|(^|\/)package-lock\.json$/i;
const BINARY = /\.(png|jpe?g|webp|gif|bmp|ico|ttf|otf|woff2?|mp4|webm|mp3|wav|ogg|zip|7z|exe|dll|node|pdf)$/i;

/**
 * Documents de travail : notes de recherche (docs/recherche), maquettes et relevés de design
 * (docs/Design : logos de tables sous licence, impressions de pages de travail), critiques,
 * consignes et réponses échangées avec les outils d'aide (critique-*.md, BRIEF*.md, reponse*.md…),
 * et les travaux internes rangés dans video/.
 * Ils servent au développement, pas aux lecteurs du projet.
 */
const PRIVATE = [/^docs\/recherche\//, /^docs\/design\//i, /^video\//, /(^|\/)(critique|brief|r[eé]ponse|consigne)[^/]*\.md$/i];
export function isPrivate(file) {
  return PRIVATE.some((re) => re.test(file.replace(/\\/g, '/')));
}

/** Liens Markdown d'un fichier publié vers un document interne : cassés sur GitHub. */
function privateLinks(file, text) {
  if (!/\.md$/i.test(file)) return [];
  const found = [];
  for (const m of text.matchAll(/\]\(([^)\s#]+)[^)]*\)/g)) {
    if (/^[a-z]+:/i.test(m[1])) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURI(m[1])));
    if (isPrivate(target)) found.push({ line: text.slice(0, m.index).split('\n').length, what: 'lien vers un document interne non publié', excerpt: m[1] });
  }
  return found;
}

/** Fichiers de secrets : jamais suivis par git, même vides (exclus aussi par .gitignore). */
const SECRET_FILES = /(^|\/)(jeton-github\.txt|\.env(\..+)?)$|\.(pem|pfx|p12|key)$/i;

const RULES = [
  { what: 'clé privée', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { what: 'jeton GitHub', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { what: 'clé d’API', re: /\bsk-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}\b/ },
  { what: 'mot de passe en clair', re: /\b(password|passwd|pwd|mot de passe)\s*[:=]\s*["'][^"'\s]{4,}["']/i },
  { what: 'chemin d’un profil Windows', re: /\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}(?!(Public|Default|All Users)\b)[A-Za-z0-9][\w.-]*/i },
];

/**
 * Motifs internes (video/motifs-internes.txt, jamais publié) : ce qui ne doit apparaître dans
 * aucun fichier publié, ni dans son contenu (« texte: <expression> ») ni dans son chemin
 * (« fichier: <expression> »). Ils restent sur ce poste : les écrire ici les publierait.
 * Le fichier se vérifie lui-même par ses exemples : « refuse-texte: », « accepte-texte: »,
 * « refuse-fichier: », « accepte-fichier: ».
 */
export function internalPatterns(file = path.join(repo, 'video', 'motifs-internes.txt')) {
  const patterns = { text: [], file: [], examples: [] };
  if (!fs.existsSync(file)) return patterns;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([a-z-]+):\s?(.*)$/.exec(line);
    if (!m) throw new Error(`video/motifs-internes.txt : ligne illisible (${line})`);
    const [, kind, value] = m;
    if (kind === 'texte') patterns.text.push(new RegExp(value, 'i'));
    else if (kind === 'fichier') patterns.file.push(new RegExp(value, 'i'));
    else if (/^(refuse|accepte)-(texte|fichier)$/.test(kind)) patterns.examples.push({ kind, value });
    else throw new Error(`video/motifs-internes.txt : sorte de ligne inconnue (${kind})`);
  }
  return patterns;
}

/** Fichier publié dont le chemin répond à un motif interne. */
export function internalFile(file, patterns) {
  const f = file.replace(/\\/g, '/');
  return !isPrivate(f) && patterns.file.some((re) => re.test(f));
}

/** Lignes d'un texte publié qui répondent à un motif interne. */
export function internalMentions(text, patterns) {
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const re of patterns.text) {
      const m = re.exec(line);
      if (m) { found.push({ line: i + 1, what: 'travail interne (motif de video/motifs-internes.txt)', excerpt: m[0] }); break; }
    }
  });
  return found;
}

/** Les exemples du fichier des motifs : chaque motif refuse et laisse passer ce qu'il doit. */
export function checkExamples(patterns) {
  const problems = [];
  for (const { kind, value } of patterns.examples) {
    const hit = kind.endsWith('texte') ? internalMentions(value, patterns).length > 0 : internalFile(value, patterns);
    if (hit !== kind.startsWith('refuse')) problems.push(`video/motifs-internes.txt : l'exemple « ${kind}: ${value} » n'est pas ${kind.startsWith('refuse') ? 'refusé' : 'accepté'}`);
  }
  return problems;
}

function privateNames() {
  if (process.env.CYBERPINBALL_AUDIT_NOMS !== undefined) return process.env.CYBERPINBALL_AUDIT_NOMS.split(',').map((n) => n.trim()).filter(Boolean);
  const file = path.join(os.homedir(), '.cyberpinball', 'audit-noms.txt');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((n) => n.trim()).filter((n) => n && !n.startsWith('#'));
}

/** Constats d'un texte : [{ ligne, quoi, extrait }]. */
export function auditText(text, names = [], { emails = true } = {}) {
  const found = [];
  const nameRes = names.map((n) => ({ what: 'nom de la liste privée', re: new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }));
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of [...RULES, ...nameRes]) {
      const m = rule.re.exec(line);
      if (m) found.push({ line: i + 1, what: rule.what, excerpt: m[0] });
    }
    if (emails) for (const m of line.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
      if (!ALLOWED_EMAILS.some((re) => re.test(m[0])) && !/\.(png|svg|webp|js|ts|css)$/i.test(m[0])) found.push({ line: i + 1, what: 'adresse e-mail', excerpt: m[0] });
    }
  });
  return found;
}

export function auditRepository({ commits } = {}) {
  const names = privateNames();
  const patterns = internalPatterns();
  const problems = [...checkExamples(patterns)];
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
  // Seuls les fichiers publiés comptent : les documents internes ne partent pas.
  for (const f of tracked.filter((x) => SECRET_FILES.test(x))) problems.push(`${f} : fichier de secret suivi par git (à retirer : git rm --cached)`);
  const files = tracked.filter((f) => !isPrivate(f));
  for (const file of files.filter((f) => internalFile(f, patterns))) problems.push(`${file} : chemin d'un travail interne (motif de video/motifs-internes.txt), à ranger dans video/`);
  for (const file of files) {
    if (BINARY.test(file)) continue;
    const full = path.join(repo, file);
    if (!fs.existsSync(full)) continue;
    const buffer = fs.readFileSync(full);
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    for (const f of [...auditText(text, names, { emails: !THIRD_PARTY.test(file) }), ...privateLinks(file, text), ...internalMentions(text, patterns)]) problems.push(`${file}:${f.line} : ${f.what} (${f.excerpt})`);
  }
  if (commits) {
    const log = execFileSync('git', ['log', '--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x01', commits], { cwd: repo, encoding: 'utf8' });
    for (const entry of log.split('\x01').map((e) => e.trim()).filter(Boolean)) {
      const [sha, author, committer, message] = entry.split('\0');
      for (const f of auditText(`${author}\n${committer}\n${message}`, names)) problems.push(`commit ${sha.slice(0, 7)} : ${f.what} (${f.excerpt})`);
    }
  }
  return { problems, files: files.length, internal: tracked.length - files.length, names: names.length, patterns: patterns.text.length + patterns.file.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--commits');
  const { problems, files, internal, names, patterns } = auditRepository({ commits: at > 0 ? process.argv[at + 1] : undefined });
  if (problems.length) {
    console.error(`Contrôle de publication : ${problems.length} problème${problems.length > 1 ? 's' : ''} (le dépôt est public) :`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`Contrôle de publication : ${files} fichiers publiés (${internal} documents internes gardés ici), rien de personnel ni de secret${names ? ` (${names} nom${names > 1 ? 's' : ''} de la liste privée)` : ', liste privée de noms absente'}${patterns ? `, ${patterns} motif${patterns > 1 ? 's' : ''} interne${patterns > 1 ? 's' : ''}` : ''}.`);
}
