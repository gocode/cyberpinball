import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  POWER_ACTIONS,
  POWER_MISSED_AFTER_MS,
  POWER_TIMER_STEP_MS,
  createPowerControl,
  powerExecutor,
  powerSimulated,
  powerStep,
  powerTexts,
  type PowerClock,
  type PowerExecutor,
  type PowerStep,
} from '../power';
import { SYSTEM_GROUPS, SYSTEM_ITEMS } from '../systemmenu';
import { APP, menuRenderer, menuState } from './menu-renderer';

// Alimentation de la borne (éteindre, mettre en veille, redémarrer) : un essai n'éteint jamais
// le poste qui le fait tourner, et la veille demandée est une vraie veille, pas une hibernation.
const REPO = path.join(__dirname, '..', '..', '..', '..');

function sources(dir: string): { file: string; text: string }[] {
  return fs
    .readdirSync(path.join(REPO, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: `${dir}/${f}`, text: fs.readFileSync(path.join(REPO, dir, f), 'utf8') }));
}

/** Code sans ses commentaires : seules les lignes qui agissent comptent. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('alimentation simulée pour tout essai, même à l’écran ; réelle seulement sans aucune variable d’essai', () => {
  assert.equal(powerSimulated({}), false);
  for (const env of [
    { CYBERPINBALL_ALIMENTATION_SIMULEE: '1' },
    { CYBERPINBALL_HORS_ECRAN: '1' },
    { CYBERPINBALL_AUTOPILOT: 'Escape' },
    { CYBERPINBALL_CAPTURE: 'tmp\\captures' },
    { CYBERPINBALL_STRESS: '5,10' },
    { CYBERPINBALL_HOME: 'tmp\\bac-a-sable' },
    // Un essai lancé à l'écran (vrais écrans) reste un essai.
    { CYBERPINBALL_AUTOPILOT: 'Escape', CYBERPINBALL_A_L_ECRAN: '1' },
    { CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_A_L_ECRAN: '1' },
    { NODE_TEST_CONTEXT: 'child' },
  ]) {
    assert.equal(powerSimulated(env), true, JSON.stringify(env));
  }
  // Ces tests eux-mêmes tournent sous node --test.
  assert.equal(powerSimulated(process.env), true);
});

test('en essai, l’exécuteur réel n’est même pas construit : l’étape est journalisée, rien ne part', async () => {
  for (const env of [{ CYBERPINBALL_HORS_ECRAN: '1' }, { CYBERPINBALL_AUTOPILOT: 'Escape', CYBERPINBALL_A_L_ECRAN: '1' }, { CYBERPINBALL_ALIMENTATION_SIMULEE: '1' }]) {
    const log: string[] = [];
    const executor = powerExecutor(env, () => assert.fail('exécuteur réel construit en essai'), (line) => log.push(line));
    for (const action of POWER_ACTIONS) {
      const outcome = await executor(powerStep(action));
      assert.deepEqual(outcome, { ok: true, simulated: true });
    }
    assert.deepEqual(log, ['Alimentation simulée : shutdown.exe /s /t 0', 'Alimentation simulée : powrprof SetSuspendState(FALSE, FALSE, FALSE)', 'Alimentation simulée : shutdown.exe /r /t 0']);
  }
  let built = 0;
  powerExecutor({}, () => (built++, async () => ({ ok: true })), () => undefined);
  assert.equal(built, 1, 'hors de tout essai, l’exécuteur réel sert');
});

test('aucune action réelle ne part ailleurs que par l’exécuteur de app/src/power.ts, gardé par powerExecutor', () => {
  const app = sources('app/src');
  const all = [...app, ...sources('packages/core/src'), ...sources('packages/win-displays/src'), ...sources('packages/installer/src')];
  // Personne n'arrête, ne met en veille ni ne redémarre Windows par un autre chemin (powercfg
  // est déjà refusé partout : FORBIDDEN_WINDOWS_CALLS, coexistence.test.ts).
  const forbidden = /rundll32|SetSuspendState|SetSystemPowerState|ExitWindowsEx|InitiateSystemShutdown|shutdown\.exe|(spawn|exec)\w*\(\s*['"`]shutdown|Stop-Computer|Restart-Computer/i;
  const offenders = all.flatMap((s) =>
    code(s.text)
      .split('\n')
      .flatMap((line, i) => (forbidden.test(line) ? [`${s.file}:${i + 1} ${line.trim()}`] : [])),
  );
  const allowed = [/^packages\/core\/src\/power\.ts:\d+ (return \{|export type PowerStep = \{) kind: 'command'; file: 'shutdown\.exe'|^packages\/core\/src\/power\.ts:\d+ return \{ kind: 'command', file: 'shutdown\.exe'/, /^packages\/win-displays\/src\/power\.ts:\d+ (SetSuspendState: |w\.SetSuspendState\.async\(0, 0, 0,)/, /^packages\/core\/src\/power\.ts:\d+ +return step\.kind === 'command' \? .*SetSuspendState\(FALSE, FALSE, FALSE\)/];
  assert.deepEqual(offenders.filter((o) => !allowed.some((a) => a.test(o))), []);

  // La mise en veille native n'est appelée que par app/src/power.ts.
  const suspendCallers = app.filter((s) => /suspendSystem\(/.test(code(s.text))).map((s) => s.file);
  assert.deepEqual(suspendCallers, ['app/src/power.ts']);
  // Et là, l'exécuteur réel n'est jamais appelé directement : il n'est donné qu'à powerExecutor,
  // qui le remplace par la simulation en essai.
  const power = code(app.find((s) => s.file === 'app/src/power.ts')!.text);
  const uses = [...power.matchAll(/realExecutor\b(\(\))?/g)].map((m) => m[0]);
  assert.deepEqual(uses, ['realExecutor()', 'realExecutor'], 'realExecutor : sa définition, puis powerExecutor(process.env, realExecutor, …)');
  assert.match(power, /powerExecutor\(process\.env, realExecutor,/);
  // spawn de app/src/power.ts : seulement dans l'exécuteur réel.
  assert.equal([...power.matchAll(/\bspawn\(/g)].length, 1);
  assert.ok(power.indexOf('spawn(') > power.indexOf('function realExecutor') && power.indexOf('spawn(') < power.indexOf('export function createPowerMenu'));
});

test('méthodes : arrêt complet sans forcer, redémarrage, vraie veille (jamais d’hibernation)', () => {
  assert.deepEqual(powerStep('shutdown'), { kind: 'command', file: 'shutdown.exe', args: ['/s', '/t', '0'] });
  assert.deepEqual(powerStep('restart'), { kind: 'command', file: 'shutdown.exe', args: ['/r', '/t', '0'] });
  assert.deepEqual(powerStep('sleep'), { kind: 'suspend' });
  for (const action of POWER_ACTIONS) {
    const step = powerStep(action);
    // /h : hibernation ; /hybrid : démarrage rapide ; /f : applications fermées sans enregistrer.
    if (step.kind === 'command') for (const flag of ['/h', '/hybrid', '/f']) assert.ok(!step.args.includes(flag), `${action} : ${flag}`);
  }
  // L'appel natif demande la veille, pas l'hibernation : bHibernate = FALSE.
  const native = fs.readFileSync(path.join(REPO, 'packages', 'win-displays', 'src', 'power.ts'), 'utf8');
  assert.match(native, /SetSuspendState\.async\(0, 0, 0,/);
});

/** Horloge d'essai : le temps n'avance que par advance() ; minuteries rangées par échéance. */
function fakeClock(start = Date.UTC(2026, 9, 26, 22)) {
  let now = start;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void; ms: number }>();
  const delays: number[] = [];
  const clock: PowerClock = {
    now: () => now,
    setTimeout: (run, ms) => {
      delays.push(ms);
      timers.set(next, { at: now + ms, run, ms });
      return next++;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
  };
  /** Avance de `ms` ; `jump` : le temps passe sans que les minuteries tournent (veille du PC). */
  const advance = (ms: number, jump = false) => {
    const end = now + ms;
    if (jump) {
      now = end;
      for (const timer of timers.values()) timer.at = Math.max(timer.at, now);
    }
    for (;;) {
      const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].run();
    }
    now = end;
  };
  return { clock, advance, delays, pending: () => timers.size };
}

function recorder() {
  const calls: string[] = [];
  const executor: PowerExecutor = async (step: PowerStep) => {
    calls.push(step.kind === 'command' ? step.args.join(' ') : 'suspend');
    return { ok: true };
  };
  return { calls, executor };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('action tout de suite : préparation (écran noir, réglages enregistrés) avant l’exécuteur ; une seule à la fois', async () => {
  const order: string[] = [];
  const control = createPowerControl({
    executor: async (step) => (order.push(`exécute ${step.kind}`), { ok: true }),
    prepare: async (action) => {
      order.push(`prépare ${action}`);
      await flush();
    },
  });
  const first = control.run('shutdown');
  const second = control.run('restart');
  assert.equal(control.busy, true);
  assert.equal(second, first, 'une action en cours : la même promesse, pas une deuxième action');
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(order, ['prépare shutdown', 'exécute command']);
  assert.equal(control.busy, false);
});

test('veille refusée sur un PC à veille moderne seulement : ni préparation ni exécuteur', async () => {
  const { calls, executor } = recorder();
  let prepared = 0;
  const control = createPowerControl({ executor, capabilities: () => ({ sleep: false }), prepare: () => void prepared++ });
  const outcome = await control.run('sleep');
  assert.equal(outcome.ok, false);
  assert.match(outcome.problem!, /veille moderne/);
  assert.deepEqual([calls, prepared], [[], 0]);
  // Éteindre reste possible.
  assert.deepEqual(await control.run('shutdown'), { ok: true });
  assert.deepEqual(calls, ['/s /t 0']);
});

test('action programmée : faite à l’heure, par pas d’une minute au plus ; annulable', async () => {
  const time = fakeClock();
  const { calls, executor } = recorder();
  const control = createPowerControl({ executor, prepare: () => undefined, clock: time.clock });
  const at = time.clock.now() + 4 * 3600_000; // 2 h du matin, quatre heures plus tard
  const done: unknown[] = [];
  const job = control.schedule('shutdown', at, { onDone: (o) => done.push(o) });
  assert.deepEqual(control.scheduled().map((s) => s.action), ['shutdown']);
  assert.ok(time.delays.every((ms) => ms <= POWER_TIMER_STEP_MS));
  time.advance(4 * 3600_000 - 1);
  await flush();
  assert.deepEqual(calls, []);
  time.advance(1);
  await flush();
  assert.deepEqual(calls, ['/s /t 0']);
  assert.deepEqual(done, [{ ok: true }]);
  assert.equal(job.pending, false);
  assert.deepEqual(control.scheduled(), []);
  assert.ok(time.delays.every((ms) => ms <= POWER_TIMER_STEP_MS), 'jamais plus d’une minute d’attente d’un coup');

  const cancelled = control.schedule('restart', time.clock.now() + 3600_000);
  cancelled.cancel();
  assert.equal(cancelled.pending, false);
  assert.equal(time.pending(), 0, 'plus aucune minuterie');
  time.advance(2 * 3600_000);
  await flush();
  assert.deepEqual(calls, ['/s /t 0']);
});

test('action programmée manquée (borne en veille à l’heure dite) : rien au réveil, sauf de peu', async () => {
  const time = fakeClock();
  const { calls, executor } = recorder();
  const control = createPowerControl({ executor, prepare: () => undefined, clock: time.clock });
  const missed: number[] = [];
  const at = time.clock.now() + 3600_000;
  control.schedule('shutdown', at, { onMissed: (_a, when) => missed.push(when) });
  // Veille du PC de 23 h à 9 h : les minuteries ne tournent pas, l'heure saute.
  time.advance(10 * 3600_000, true);
  await flush();
  assert.deepEqual([calls, missed], [[], [at]]);

  // Réveil une minute après l'heure : encore à temps.
  const soon = time.clock.now() + 3600_000;
  control.schedule('sleep', soon);
  time.advance(3600_000 + POWER_MISSED_AFTER_MS - 60_000, true);
  await flush();
  assert.deepEqual(calls, ['suspend']);
});

test('textes : chaque action dit ce qui va se passer, et ce que font Start et Exit', () => {
  for (const action of POWER_ACTIONS) {
    const texts = powerTexts(action);
    assert.match(texts.question, /\?$/, action);
    assert.ok(texts.steps.length >= 2, action);
    assert.match(texts.hint, /^Start : .+ · Exit : annuler$/, action);
    assert.ok(texts.progress.endsWith('…'), action);
    assert.ok(texts.label && texts.detail && texts.progressLine, action);
  }
  // L'arrêt et le redémarrage ferment Cyber Pinball ; la veille le garde ouvert.
  assert.match(powerTexts('shutdown').steps.join(' '), /se ferme/);
  // Le constat d'un essai parle au joueur, pas de la commande (elle reste dans le journal).
  for (const action of POWER_ACTIONS) assert.match(powerTexts(action).simulated, /^Mode essai : .+ simulée?, le PC reste allumé\.$/, action);
  assert.match(powerTexts('sleep').steps.join(' '), /reste ouvert/);
});

test('menu système : veille, redémarrage et extinction dans la rubrique Cyber Pinball, après « Quitter Cyber Pinball », nommés comme leur confirmation', () => {
  // Les sorties ensemble (27/10/2026), de la plus légère à la plus lourde.
  const cyberpinball = SYSTEM_GROUPS.cyberpinball.entries;
  assert.deepEqual(cyberpinball.slice(-4), ['quit', 'sleep', 'restart', 'shutdown']);
  for (const action of POWER_ACTIONS) assert.ok(!SYSTEM_GROUPS.borne.entries.includes(action), `« ${action} » est encore dans la rubrique Borne`);
  for (const action of POWER_ACTIONS) assert.equal(SYSTEM_ITEMS[action].label, powerTexts(action).label);
  assert.deepEqual(POWER_ACTIONS.map((a) => SYSTEM_ITEMS[a].icon), ['power', 'moon', 'restart']);
});

// ---------- Écrans du menu ----------

test('écran noir de l’action : sans roue dentée, rien à choisir', () => {
  const { document, send } = menuRenderer();
  const message = { title: 'Extinction de la borne…', lines: ['Réglages enregistrés ; Windows éteint le PC.'], action: 'power' };
  send({ ...menuState({ 'A.vpx': undefined, 'B.vpx': undefined, 'C.vpx': undefined }), phase: 'message', message });
  assert.equal(document.querySelector('#root .gear'), null);
  // Du noir uni, sans la marque ni le décor du menu.
  assert.ok(document.documentElement.classList.contains('power-phase'));
  assert.equal(document.querySelector('#root .brand'), null);
  assert.ok(document.querySelector('#root .overlay.power'));
  assert.match(document.querySelector('#root .overlay h1')!.textContent!, /Extinction de la borne/);
  assert.equal(document.querySelector('#root .overlay .footer'), null, 'aucun bouton proposé');
  // Un message ordinaire garde sa roue.
  send({ ...menuState({ 'A.vpx': undefined, 'B.vpx': undefined, 'C.vpx': undefined }), phase: 'message', message: { title: 'Aucune table', lines: [] } });
  assert.ok(document.querySelector('#root .gear'));
  assert.ok(!document.documentElement.classList.contains('power-phase'));
});

test('constat en bandeau au menu des tables (essai simulé, configuration reconnue…) : par-dessus le menu, sous la marque, avant la roue dentée', () => {
  // Vu sur la borne pivotée : posé avant le menu, il passait sous son voile, et sa largeur (en
  // vmin de la fenêtre, pas de la zone) le faisait passer sous la roue dentée.
  const { document, send } = menuRenderer();
  send({ ...menuState({ 'A.vpx': undefined, 'B.vpx': undefined, 'C.vpx': undefined }), banner: 'Essai : « Éteindre la borne » simulé' });
  const root = document.querySelector('#root')!;
  assert.equal(root.lastElementChild?.className, 'banner', 'le bandeau vient en dernier : rien ne le recouvre');
  const css = fs.readFileSync(path.join(APP, 'renderer', 'frontend.css'), 'utf8');
  const rule = (selector: string) => new RegExp(`\\n\\${selector} \\{([^}]*)\\}`).exec(css)![1]!;
  const cq = (block: string, prop: string) => Number(new RegExp(`\\n\\s*${prop}: ([\\d.]+)cqmin;`).exec(block)?.[1]);
  const banner = rule('.banner');
  assert.doesNotMatch(banner, /\dvmin/, 'aux unités de la zone, comme la marque et la roue dentée');
  const gear = rule('.gear');
  const gearReach = cq(gear, 'right') + 2 * cq(gear, 'padding') + cq(gear, 'font-size');
  assert.ok(cq(banner, 'right') >= gearReach, `bandeau à ${cq(banner, 'right')}cqmin du bord, roue dentée jusqu'à ${gearReach}cqmin`);
  const brand = rule('.brand');
  assert.ok(cq(banner, 'top') >= 3 + cq(brand, 'font-size'), 'sous la marque');
});
