import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fingerprintOf } from '../fingerprint';
import { offscreenMode, parseSimulatedDisplays, realScreensRefusal } from '../offscreen';
import { devPcDisplays } from './fixtures';

// Mode hors écran des essais sans opérateur : les fenêtres ne doivent jamais apparaître
// sur les écrans du poste, et les écrans de la borne peuvent être simulés (docs\ecrans).
const REPO = path.join(__dirname, '..', '..', '..', '..');
const SOURCES = path.join(REPO, 'app', 'src');
const SCREENS = path.join(REPO, 'docs', 'ecrans');

const screens = (name: string) => parseSimulatedDisplays(JSON.parse(fs.readFileSync(path.join(SCREENS, `${name}.json`), 'utf8')), name);

test('hors écran : imposé, automatique sans opérateur, sauf CYBERPINBALL_A_L_ECRAN=1', () => {
  assert.equal(offscreenMode({}), false);
  assert.equal(offscreenMode({ CYBERPINBALL_HORS_ECRAN: '1' }), true);
  assert.equal(offscreenMode({ CYBERPINBALL_AUTOPILOT: 'Digit1' }), true);
  assert.equal(offscreenMode({ CYBERPINBALL_CAPTURE: 'tmp\\captures' }), true);
  assert.equal(offscreenMode({ CYBERPINBALL_STRESS: '5,10' }), true);
  assert.equal(offscreenMode({ CYBERPINBALL_AUTOPILOT: 'Digit1', CYBERPINBALL_A_L_ECRAN: '1' }), false);
  assert.equal(offscreenMode({ CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_A_L_ECRAN: '1' }), false);
  assert.match(realScreensRefusal('Le test d’endurance'), /^Le test d’endurance nécessite les écrans du poste.*CYBERPINBALL_A_L_ECRAN=1/);
});

test('les jeux d’écrans de docs\\ecrans sont valides', () => {
  const files = fs.readdirSync(SCREENS).filter((f) => f.endsWith('.json'));
  assert.deepEqual(files.sort(), ['borne.json', 'pc-dev.json', 'poste-deux-ecrans.json', 'un-ecran.json']);
  for (const f of files) assert.ok(screens(f.replace('.json', '')).length >= 1, f);
});

test('pc-dev.json : les quatre écrans du PC de développement (fixtures), triés comme probeDisplays', () => {
  const expected = devPcDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  assert.deepEqual(screens('pc-dev'), expected);
});

test('borne.json : playfield 4K couché, fronton, DMD 4:1 et topper, chacun reconnaissable', () => {
  const d = screens('borne');
  assert.equal(d.length, 4);
  const playfield = d.find((s) => s.primary)!;
  assert.deepEqual([playfield.bounds.width, playfield.bounds.height, playfield.rotation], [3840, 2160, 0]);
  assert.ok(d.some((s) => s.bounds.width / s.bounds.height === 4), 'un DMD 4:1');
  assert.equal(new Set(d.map((s) => fingerprintOf(s).key)).size, 4, 'quatre empreintes distinctes');
  assert.ok(d.every((s) => s.edid), 'EDID de chaque écran');
});

test('poste-deux-ecrans.json et un-ecran.json : le principal et deux écrans, ou le principal seul', () => {
  assert.equal(screens('poste-deux-ecrans').length, 3);
  assert.deepEqual(screens('un-ecran').map((s) => s.primary), [true]);
});

test('écrans simulés mal formés : refusés, avec l’écran et le champ fautifs', () => {
  const ok = devPcDisplays();
  assert.throws(() => parseSimulatedDisplays([], 'vide.json'), /vide\.json.*non vide/);
  assert.throws(() => parseSimulatedDisplays([{ ...ok[0], bounds: { x: 0, y: 0, width: 0, height: 10 } }, ok[1]], 'f'), /écran 1 : « bounds »/);
  assert.throws(() => parseSimulatedDisplays([ok[0], { ...ok[1], rotation: 45 }], 'f'), /écran 2 : « rotation »/);
  assert.throws(() => parseSimulatedDisplays([{ ...ok[1], gdiName: 'DISPLAY1' }], 'f'), /« gdiName »/);
  assert.throws(() => parseSimulatedDisplays([ok[0]], 'f'), /un seul écran principal.*0 trouvés/);
  assert.throws(() => parseSimulatedDisplays([ok[1], { ...ok[3], primary: true }], 'f'), /un seul écran principal/);
  assert.throws(() => parseSimulatedDisplays([{ ...ok[1], edid: { manufacturer: 'x' } }], 'f'), /« edid »/);
});

function appSources(): { file: string; text: string }[] {
  return fs
    .readdirSync(SOURCES)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, text: fs.readFileSync(path.join(SOURCES, file), 'utf8') }));
}

/** Lignes des sources de l'app, hors du module permis, qui correspondent au motif. */
function offenders(pattern: RegExp, allowed: string): string[] {
  return appSources()
    .filter((s) => s.file !== allowed)
    .flatMap((s) => s.text.split('\n').flatMap((line, i) => (pattern.test(line) && !/^\s*(\/\/|\*)/.test(line) ? [`${s.file}:${i + 1} ${line.trim()}`] : [])));
}

/**
 * Les démonstrations hors écran (docs\demo-*.cjs) créent la bibliothèque avec un hôte factice :
 * sans mode invité (host.guest, obligatoire depuis guestmode.ts), elles s'arrêtaient au premier
 * écran (« Cannot read properties of undefined (reading 'knock') », 27/10/2026, treize d'entre elles).
 */
test('toute démonstration qui crée la bibliothèque lui donne un mode invité', () => {
  const docs = path.join(REPO, 'docs');
  const missing = fs
    .readdirSync(docs)
    .filter((f) => /^demo-.*\.cjs$/.test(f))
    .flatMap((f) => {
      const text = fs.readFileSync(path.join(docs, f), 'utf8');
      return [...text.matchAll(/createLibrary\(\{([\s\S]*?)\n\s*\}\);/g)].filter((m) => !/\bguest:/.test(m[1]!)).map(() => f);
    });
  assert.deepEqual(missing, [], 'ajouter guest: { active: false, allows: () => true, knock: () => true } à createLibrary');
});

test('toute fenêtre naît par createWindow : hors écran pendant un essai', () => {
  assert.deepEqual(offenders(/new BrowserWindow\(/, 'offscreen.ts'), [], 'utiliser createWindow(options) de app/src/offscreen.ts');
});

test('jamais d’écran clair : toute fenêtre à l’écran naît sans fond système de Windows', () => {
  // Sans page affichée, Windows 11 peint la fenêtre du fond de son thème (#F3F3F3 en clair).
  const create = fs.readFileSync(path.join(SOURCES, 'offscreen.ts'), 'utf8').match(/export function createWindow[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(create, /if \(!OFFSCREEN\) \{\s*const win = new BrowserWindow\(\{ \.\.\.options, backgroundMaterial: 'none' \}\);\s*trackPainting\(win\);/);
  assert.deepEqual(offenders(/backgroundMaterial/, 'offscreen.ts'), [], 'le fond système des fenêtres est fixé par createWindow');
});

test('jamais d’écran clair : plein écran et réduction ne passent que par cover-display.ts', () => {
  // Une fenêtre montrée, ou rouverte, déjà en plein écran est peinte en bleu pâle (#D3E3FD) :
  // coverDisplay ne la met en plein écran qu'une fois affichée, minimizeCovered le quitte avant
  // de la réduire.
  assert.deepEqual(offenders(/\.(setFullScreen|setKiosk|minimize)\(/, 'cover-display.ts'), [], 'utiliser coverDisplay ou minimizeCovered de app/src/cover-display.ts');
  const cover = fs.readFileSync(path.join(SOURCES, 'cover-display.ts'), 'utf8');
  assert.match(cover, /if \(!displayed\.has\(win\)\) return;\s*win\.setFullScreen\(true\);/);
});

test('les écrans ne se lisent que par observedDisplays : les écrans simulés valent partout', () => {
  assert.deepEqual(offenders(/probeDisplays\(/, 'displays.ts'), [], 'utiliser observedDisplays() de app/src/displays.ts');
});

test('la géométrie d’Electron ne se lit que par offscreen.ts : un écran simulé n’est pas sur le bureau', () => {
  assert.deepEqual(offenders(/screenToDipRect|getPrimaryDisplay|getAllDisplays/, 'offscreen.ts'), [], 'utiliser windowRect() ou primaryRect()');
});

test('la visibilité d’une fenêtre se lit par isShown : hors écran, aucune n’est vraiment visible', () => {
  assert.deepEqual(offenders(/\.isVisible\(\)/, 'offscreen.ts'), [], 'utiliser isShown(win) de app/src/offscreen.ts');
});

// Une WebContentsView qu'aucune fenêtre ne porte et que plus rien ne référence est détruite
// par le ramasse-miettes : le téléchargement direct de VPForums fermait ensuite une page
// déjà détruite (« Object has been destroyed »), exception qui figeait le processus
// principal derrière la boîte modale d'Electron, sur la borne comme sur le bureau caché.
test('une vue sans fenêtre est gardée jusqu’à sa fermeture, et une page détruite ne se referme pas', () => {
  const kept = appSources().flatMap((s) => {
    const lines = s.text.split('\n');
    return lines.flatMap((line, i) =>
      /new WebContentsView\(/.test(line) && !/addChildView\(|hiddenViews\.add\(/.test(lines.slice(i, i + 6).join(' ')) ? [`${s.file}:${i + 1} ${line.trim()}`] : [],
    );
  });
  assert.deepEqual(kept, [], 'ajouter la vue à une fenêtre (addChildView) ou la garder (hiddenViews) jusqu’à sa fermeture');
  assert.deepEqual(
    offenders(/[cC]ontents\.close\(/, '').filter((l) => !/isDestroyed\(\)/.test(l)),
    [],
    'fermer une vue cachée par closeHidden, ou vérifier isDestroyed() avant close()',
  );
});

test('hors écran, une exception non rattrapée arrête l’essai au lieu d’ouvrir une boîte modale', () => {
  const text = fs.readFileSync(path.join(SOURCES, 'offscreen.ts'), 'utf8');
  assert.match(text, /if \(OFFSCREEN\) \{\s*process\.on\('uncaughtException'[\s\S]*?app\.exit\(1\)/);
});

test('à l’écran, une exception non rattrapée est journalisée et l’application continue, sans boîte modale', () => {
  assert.match(fs.readFileSync(path.join(SOURCES, 'main.ts'), 'utf8'), /if \(!OFFSCREEN\) journalUncaught\(loc\.dataDir\);/);
  const text = fs.readFileSync(path.join(SOURCES, 'uncaught.ts'), 'utf8');
  assert.match(text, /process\.on\('uncaughtException'/);
  assert.match(text, /process\.on\('unhandledRejection'/);
  assert.doesNotMatch(text, /app\.(exit|quit)\(|dialog\./);
});

// Nouvelle console : Windows la confie au Terminal, qui s'ouvre sur le bureau de l'utilisateur,
// même depuis le bureau caché. Les scripts lancent les outils en ligne de commande dans leur
// propre console, et l'application avec windowsHide.
test('scripts : aucune nouvelle console (Start-Process -NoNewWindow, sauf programme à fenêtres)', () => {
  const scripts = [path.join(REPO, 'lanceur.ps1'), ...fs.readdirSync(path.join(REPO, 'docs')).filter((f) => f.endsWith('.ps1')).map((f) => path.join(REPO, 'docs', f))];
  const found = scripts.flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (/Start-Process/.test(line) && !/^\s*#/.test(line) && !/-NoNewWindow|electron|notepad|\$exe\.FullName/.test(line) ? [`${path.basename(file)}:${i + 1} ${line.trim()}`] : [])),
  );
  assert.deepEqual(found, []);
});

test('application : tout outil en ligne de commande est lancé avec windowsHide', () => {
  const dirs = [SOURCES, ...['core', 'win-displays', 'installer'].map((p) => path.join(REPO, 'packages', p, 'src'))];
  const found = dirs.flatMap((dir) =>
    fs
      .readdirSync(dir)
      // Programmes à fenêtres : VPX (launcher.ts), l'installeur de la mise à jour et sa page de progression (updates-menu.ts),
      // Cyber Pinball relancé après la mise à jour légère (maj-legere.ts).
      .filter((f) => f.endsWith('.ts') && f !== 'launcher.ts' && f !== 'updates-menu.ts' && f !== 'maj-legere.ts')
      .flatMap((f) => {
        const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
        return lines.flatMap((line, i) =>
          // « // fenêtre voulue » en fin de ligne : un programme lancé pour être vu (l'Explorateur de la borne dédiée).
          /\b(spawn|spawnSync|execFile|execFileSync|execSync)\(/.test(line) && !/windowsHide: true/.test(lines.slice(i, i + 4).join(' ')) && !/\/\/ fenêtre voulue$/.test(line.trim())
            ? [`${f}:${i + 1} ${line.trim()}`]
            : [],
        );
      }),
  );
  assert.deepEqual(found, []);
});

// Dans un worktree neuf, packages\*\dist n'existe pas encore : demo-mise-a-jour.ps1 s'arrêtait
// sur un module introuvable avant d'avoir compilé quoi que ce soit.
test('scripts : une démonstration qui lit le code compilé le compile d’abord', () => {
  const scripts = [path.join(REPO, 'lanceur.ps1'), ...fs.readdirSync(path.join(REPO, 'docs')).filter((f) => f.endsWith('.ps1')).map((f) => path.join(REPO, 'docs', f))];
  const found = scripts.filter((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return /[\\/]dist[\\/]/.test(text) && !/npm run build|Assert-Compile|tsc -b/.test(text);
  });
  assert.deepEqual(found.map((f) => path.basename(f)), []);
});

// Windows PowerShell 5.1 lit en ANSI un fichier UTF-8 sans BOM (ceux qu'écrit l'application) :
// « Aucun problème » n'y correspondait plus à son motif, et demo-captures.ps1 échouait à tort.
test('scripts : un fichier lu pour y chercher un texte accentué l’est en UTF-8', () => {
  const scripts = [path.join(REPO, 'lanceur.ps1'), ...fs.readdirSync(path.join(REPO, 'docs')).filter((f) => f.endsWith('.ps1')).map((f) => path.join(REPO, 'docs', f))];
  const found = scripts.flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (/Get-Content\b/.test(line) && !/-Encoding\b/.test(line) && /-(not)?match\b/.test(line) && /[^\x00-\x7F]/.test(line) ? [`${path.basename(file)}:${i + 1} ${line.trim()}`] : [])),
  );
  assert.deepEqual(found, []);
});

// PowerShell ignore la casse : une variable locale $ecrans écrasait le paramètre [string]$Ecrans
// (et devenait une seule chaîne au lieu d'une liste de touches). Une boucle foreach ($ecrans
// in $Ecrans) aussi : la variable de boucle est le paramètre, qui ne vaut plus ensuite que son
// dernier élément (vu dans demo-alimentation.ps1 : le second scénario ne tournait que sur un jeu d'écrans).
test('scripts : aucun paramètre réaffecté dans le corps du script, ni pris comme variable de boucle', () => {
  const scripts = [path.join(REPO, 'lanceur.ps1'), ...fs.readdirSync(path.join(REPO, 'docs')).filter((f) => f.endsWith('.ps1')).map((f) => path.join(REPO, 'docs', f))];
  const found = scripts.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const block = /^param\(([\s\S]*?)^\)/m.exec(text) ?? /^param\((.*)\)$/m.exec(text);
    if (!block) return [];
    const names = [...block[1]!.matchAll(/\$(\w+)/g)].map((m) => m[1]!.toLowerCase());
    const body = text.slice(block.index + block[0].length).split('\n');
    return body.flatMap((line, i) => {
      const m = /^\s*\$(\w+)\s*=[^=]/.exec(line) ?? /\bforeach\s*\(\s*\$(\w+)\s+in\b/i.exec(line);
      return m && names.includes(m[1]!.toLowerCase()) ? [`${path.basename(file)} : $${m[1]} réaffecté ou pris comme variable de boucle (« ${line.trim()} »)`] : [];
    });
  });
  assert.deepEqual(found, []);
});

test('chaque démonstration tourne sur le bureau caché, ou exige les écrans du poste', () => {
  const demos = fs.readdirSync(path.join(REPO, 'docs')).filter((f) => /^demos?-.*\.ps1$/.test(f));
  for (const f of demos) {
    const text = fs.readFileSync(path.join(REPO, 'docs', f), 'utf8');
    assert.ok(/Enter-BureauCache \$PSCommandPath \$PSBoundParameters/.test(text) || /Assert-EcransDuPoste/.test(text), `${f} : ni bureau caché ni Assert-EcransDuPoste`);
  }
});

// Essai réel : l'assistant sur la borne simulée, quatre fenêtres rendues hors écran.
// Le guet de offscreen.ts relève toute fenêtre visible ou au premier plan (isVisible,
// isFocused, fenêtres natives du processus) dans hors-ecran.txt.
test('démo hors écran : aucune fenêtre visible ni au premier plan, captures à la taille des écrans simulés', { timeout: 120_000 }, (t) => {
  const electron = electronPath();
  if (process.platform !== 'win32' || !electron) return t.skip('Electron sous Windows requis');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-hors-ecran-'));
  try {
    const captures = path.join(dir, 'captures');
    const audio = path.join(dir, 'sans-son.json');
    fs.writeFileSync(audio, '[]');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CYBERPINBALL_HOME: path.join(dir, 'home'),
      CYBERPINBALL_ROOT: path.join(dir, 'root'),
      CYBERPINBALL_DISPLAYS: path.join(SCREENS, 'borne.json'),
      CYBERPINBALL_AUDIO_OUTPUTS: audio,
      // Délai des boutons passé, puis le playfield choisi.
      CYBERPINBALL_AUTOPILOT: 'SansBoutons,Digit1',
      CYBERPINBALL_CAPTURE: captures,
    };
    delete env.CYBERPINBALL_A_L_ECRAN;
    delete env.CYBERPINBALL_HORS_ECRAN;
    // Lancé sur le bureau de l'utilisateur, l'essai doit se relancer de lui-même sur le bureau
    // Windows caché : même si le mode hors écran cassait, rien n'apparaîtrait sur les écrans du
    // poste (le guet, lui, le signalerait).
    const run = spawnSync(electron, ['app', '--assistant', `--user-data-dir=${path.join(dir, 'chromium')}`], { cwd: REPO, env, encoding: 'utf8', timeout: 100_000, windowsHide: true });
    const output = `${run.stdout}\n${run.stderr}`;
    assert.equal(run.status, 0, output);
    assert.match(output, /relancé sur le bureau Windows caché « CyberPinballEssais »/);
    assert.match(output, /Hors écran : Aucune fenêtre visible/, 'la sortie du bureau caché revient ici');
    const watch = fs.readFileSync(path.join(captures, 'hors-ecran.txt'), 'utf8');
    assert.match(watch, /^Aucune fenêtre visible ni au premier plan \(4 fenêtres/, watch);
    const sizes = fs
      .readdirSync(captures)
      .filter((f) => f.startsWith('00-start-'))
      .sort()
      .map((f) => pngSize(path.join(captures, f)));
    assert.deepEqual(sizes, ['3840×2160', '1920×1080', '1920×480', '1920×540']);
    assert.equal(fs.readdirSync(captures).filter((f) => f.endsWith('.png')).length, 3 * 4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

function pngSize(file: string): string {
  const b = fs.readFileSync(file);
  return `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`;
}
