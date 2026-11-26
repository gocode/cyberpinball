import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EN_MESSAGES } from '../i18n/en';
import { futurePinballCommand, futurePinballDmdMirror } from '../futurepinball';

// Future Pinball sans PinUP (décision du 26/11/2026) : Cyber Pinball n'utilise pas PinUP. Une table « PinEvent »
// teste l'objet PinUP et, s'il manque, coupe d'elle-même ses vidéos et ses sons PUP : elle se joue avec le DMD et
// les sons du jeu. Aucun texte de Future Pinball ne présente donc PinUP comme requis, et le lancement ne dépend
// d'aucun dossier de PinUP. Placer ou fermer les fenêtres d'un PinUP déjà installé reste permis (ce n'est pas
// une dépendance) : seuls les textes et les chemins sont contrôlés ici.

const REPO = path.join(__dirname, '..', '..', '..', '..');
const PINUP = /pin\s*-?\s*up|popper/i;

/** Fichiers de Future Pinball : app/src/futurepinball*.ts et packages/core/src/futurepinball*.ts. */
function futurePinballSources(): string[] {
  const dirs = [path.join(REPO, 'app', 'src'), path.join(REPO, 'packages', 'core', 'src')];
  return dirs.flatMap((dir) => fs.readdirSync(dir).filter((f) => /^futurepinball.*\.ts$/.test(f)).map((f) => path.join(dir, f)));
}

/** Le code sans ses commentaires (les commentaires peuvent citer PinUP pour expliquer). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** Premiers arguments littéraux de t(…) et tn(…) : les textes affichés. */
function uiTexts(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\btn?\(\s*(?:[^,'"`()]+,\s*)?'((?:[^'\\]|\\.)*)'(?:\s*,\s*'((?:[^'\\]|\\.)*)')?/g)) {
    out.push(m[1]!);
    if (m[2]) out.push(m[2]);
  }
  return out;
}

test('Future Pinball sans PinUP : aucun texte de son écran ne présente PinUP comme requis', () => {
  const files = futurePinballSources();
  assert.ok(files.length >= 3, `fichiers de Future Pinball trouvés : ${files.length}`);
  const bad: string[] = [];
  for (const file of files) {
    for (const text of uiTexts(withoutComments(fs.readFileSync(file, 'utf8')))) {
      if (PINUP.test(text)) bad.push(`${path.basename(file)} : ${text}`);
      const en = EN_MESSAGES[text];
      if (en && PINUP.test(en)) bad.push(`${path.basename(file)} (anglais) : ${en}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('Future Pinball sans PinUP : le lancement ne dépend d’aucun dossier de PinUP', () => {
  const bad: string[] = [];
  for (const file of futurePinballSources()) {
    const code = withoutComments(fs.readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      if (/PinUPSystem|PUPVideos|PinUpPlayer\.exe|PinUpPlayer\.PinDisplay/i.test(m[2]!)) bad.push(`${path.basename(file)} : ${m[2]}`);
    }
  }
  assert.deepEqual(bad, [], 'chemin ou objet de PinUP dans le code de Future Pinball');

  const install = { exe: 'D:\\CP\\emulators\\futurepinball\\Future Pinball.exe', gameDir: 'D:\\CP\\emulators\\futurepinball', loader: 'D:\\CP\\emulators\\futurepinball\\BAM\\FPLoader.exe' };
  const table = 'D:\\CP\\tables\\Retroflair (PinEvent V2)\\Retroflair.fpt';
  const { loader: _bam, ...withoutBam } = install;
  for (const command of [futurePinballCommand(install, table), futurePinballCommand(withoutBam, table), futurePinballDmdMirror(install, table, () => true)]) {
    assert.ok(command);
    assert.doesNotMatch([command.file, command.cwd, ...command.args].join(' '), PINUP);
  }
});
