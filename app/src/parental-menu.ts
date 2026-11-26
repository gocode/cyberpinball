import { PARENTAL_TIMEOUTS, parentalTableKey, t, type ParentalControl, type ParentalScope, type ParentalSettings, type PinResult, type TableEntry } from '@cyberpinball/core';
import type { Built, Action, Row } from './library-types';

export interface PinView {
  title: string;
  digits: string[];
  index: number;
  hint: string;
  status?: string;
}

interface LocalKeys {
  previous: string[];
  next: string[];
  confirm: string[];
  exit: string[];
}

interface Host {
  policy: ParentalControl;
  keys(): LocalKeys;
  guest(): boolean;
  allowed(): boolean;
  changed(): void;
  ownerMenu(build: () => Built): void;
  back(): void;
  groups(): readonly { id: string; label: string }[];
  tables(): readonly TableEntry[];
  pickGroup(id: string): void;
  pickTable(table: TableEntry): void;
}

interface Prompt {
  title: string;
  index: number;
  digit: number;
  entered: string;
  status?: string;
  busy: boolean;
  submit(pin: string, request: Prompt): Promise<void>;
}

export function createParentalMenu(host: Host) {
  const policy = host.policy;
  let prompt: Prompt | undefined;
  let ownerOpen = false;
  const pressed = new Set<string>();
  const redraw = () => host.changed();

  function error(result: PinResult): string {
    switch (result) {
      case 'incorrect': return t('Code incorrect ou confirmation différente.');
      case 'wait': return t('Trop de tentatives. Réessaie plus tard.');
      case 'busy': return t('Vérification en cours…');
      case 'storage': return t('Impossible d’enregistrer le contrôle parental.');
      case 'locked': return t('Le contrôle parental est verrouillé.');
      default: return '';
    }
  }

  function ask(title: string, submit: Prompt['submit']): void {
    if (prompt || host.guest() || !host.allowed()) return;
    pressed.clear();
    prompt = { title, index: 0, digit: 0, entered: '', busy: false, submit };
    redraw();
  }

  function finish(request: Prompt, result: PinResult, next: () => void): void {
    if (prompt !== request) return;
    prompt = undefined;
    if (result === 'ok') next();
    else {
      ask(request.title, request.submit);
      if (prompt) (prompt as Prompt).status = error(result);
    }
    redraw();
  }

  function unlock(scope: ParentalScope, next: () => void): void {
    ask(t('Saisir le code PIN'), async (pin, request) => {
      finish(request, await policy.unlock(scope, pin), next);
    });
  }

  function setPin(next: () => void): void {
    ask(t('Choisir un nouveau code PIN'), async (pin, first) => {
      finish(first, 'ok', () => ask(t('Confirmer le nouveau code PIN'), async (confirm, second) => {
        const result = await policy.setPin(pin, confirm);
        if (result === 'incorrect' && prompt === second) {
          prompt = undefined;
          setPin(next);
          if (prompt) (prompt as Prompt).status = error(result);
          redraw();
        } else finish(second, result, next);
      }));
    });
  }

  function closeOwner(): void {
    ownerOpen = false;
    policy.lock();
    host.back();
  }

  function ownerScreen(build: () => Built): void {
    ownerOpen = true;
    host.ownerMenu(build);
  }

  function settingsList(kind: 'tables' | 'collections', choose: boolean): void {
    const back = () => ownerScreen(settings);
    const build = (): Built => {
      if (!policy.canConfigure) return expired();
      const bag = policy.settings[kind];
      const rows: Row[] = [];
      const actions: Action[] = [];
      const groupList = host.groups().map(({ id, label }) => ({ id, label, key: id.toLowerCase(), select: () => unlock({ kind: 'collection', id }, () => { ownerOpen = false; host.pickGroup(id); }) }));
      const tableList = host.tables().map((table) => ({ id: table.id, label: table.title, key: parentalTableKey(table.id), select: () => unlock({ kind: 'table', id: table.id }, () => { ownerOpen = false; host.pickTable(table); }) }));
      for (const item of kind === 'tables' ? tableList : groupList) {
        const selected = bag.includes(item.key);
        if (choose && !(kind === 'tables' ? policy.tableProtected(item.id) : policy.collectionProtected(item.id))) continue;
        const action = actions.push({
          label: item.label, key: item.id,
          run: () => {
            if (!policy.canConfigure) return;
            if (choose) return item.select();
            const old = policy.settings;
            const changed = new Set(old[kind]);
            if (changed.has(item.key)) changed.delete(item.key); else changed.add(item.key);
            policy.configure({ ...old, [kind]: [...changed] });
            redraw();
          },
        }) - 1;
        rows.push({ text: item.label, detail: selected || choose ? t('Protégé') : t('Sans protection'), action, pick: true });
      }
      actions.push({ label: t('Retour'), run: back });
      return {
        heading: choose ? t('Ouvrir un élément protégé') : kind === 'tables' ? t('Tables protégées') : t('Collections protégées'),
        actions, sections: [{ rows }], back,
      };
    };
    ownerScreen(build);
  }

  function expired(): Built {
    return { heading: t('Contrôle parental'), lead: t('Le contrôle parental est verrouillé.'), sections: [], actions: [{ label: t('Retour'), run: closeOwner }], back: closeOwner };
  }

  function settings(): Built {
    if (!policy.canConfigure) return expired();
    const { enabled, hidden, idleMinutes } = policy.settings;
    const actions: Action[] = [];
    const change = (delta: Partial<ParentalSettings>) => {
      policy.configure({ ...policy.settings, ...delta });
      redraw();
    };
    if (!policy.hasPin) {
      actions.push({ label: t('Créer un code PIN'), run: () => setPin(() => ownerScreen(settings)) });
    } else {
      actions.push(
        { label: enabled ? t('Désactiver la protection') : t('Activer la protection'), run: () => change({ enabled: !policy.enabled }) },
        { label: t('Modifier le code PIN'), run: () => setPin(() => ownerScreen(settings)) },
        { label: t('Collections protégées'), run: () => settingsList('collections', false) },
        { label: t('Tables protégées'), run: () => settingsList('tables', false) },
        { label: t('Inactivité : {minutes} min', { minutes: idleMinutes }), run: () => {
          const at = PARENTAL_TIMEOUTS.findIndex((minutes) => minutes === policy.settings.idleMinutes);
          change({ idleMinutes: PARENTAL_TIMEOUTS[(at + 1) % PARENTAL_TIMEOUTS.length]! });
        } },
        { label: hidden ? t('Collections protégées : masquées') : t('Collections protégées : cadenas'), run: () => change({ hidden: !policy.settings.hidden }) },
      );
    }
    actions.push({ label: t('Retour'), run: closeOwner });
    return { heading: t('Contrôle parental'), sections: [], actions, back: closeOwner };
  }

  function home(): Built {
    const actions: Action[] = [];
    if (!policy.damaged) {
      const configure = () => ownerScreen(settings);
      const withPin = (next: () => void) => policy.hasPin ? unlock({ kind: 'settings' }, next) : next();
      actions.push({ label: t('Paramètres du contrôle parental'), run: () => withPin(configure) });
      if (policy.enabled) {
        actions.push(
          { label: t('Ouvrir une collection protégée'), run: () => withPin(() => settingsList('collections', true)) },
          { label: t('Ouvrir une table protégée'), run: () => withPin(() => settingsList('tables', true)) },
          { label: t('Reverrouiller maintenant'), run: closeOwner },
        );
      }
    }
    actions.push({ label: t('Retour'), run: closeOwner });
    return { heading: t('Contrôle parental'), lead: policy.damaged ? t('Configuration illisible. Consulte la procédure de récupération.') : undefined, sections: [], actions, back: closeOwner };
  }

  return {
    get active(): boolean { return prompt !== undefined; },
    get ownerOpen(): boolean { return ownerOpen; },
    open(): void { if (!host.guest() && host.allowed()) ownerScreen(home); },
    lock(): void { prompt = undefined; policy.lock(); redraw(); },
    request(scope: ParentalScope, go: () => void): void { unlock(scope, go); },
    release(code: string): void { pressed.delete(code); },
    input(code: string, repeated: boolean): void {
      const current = prompt;
      if (!current || repeated || pressed.has(code)) return;
      pressed.add(code);
      const keys = host.keys();
      if (keys.exit.includes(code)) {
        if (current.busy) policy.lock();
        prompt = undefined;
      } else if (!current.busy && !policy.waitingSeconds) {
        if (keys.previous.includes(code)) current.digit = (current.digit + 9) % 10;
        else if (keys.next.includes(code)) current.digit = (current.digit + 1) % 10;
        else if (keys.confirm.includes(code)) {
          current.entered += String(current.digit);
          if (current.index === 3) {
            current.busy = true;
            const pin = current.entered;
            current.entered = '';
            void current.submit(pin, current);
          } else {
            current.index++;
            current.digit = 0;
          }
        }
      }
      redraw();
    },
    view(): PinView | undefined {
      if (!prompt) return undefined;
      const { index, digit, busy, status, title } = prompt;
      const waiting = policy.waitingSeconds;
      return {
        title, index,
        digits: [0, 1, 2, 3].map((n) => busy || n < index ? '●' : n === index ? String(digit) : '—'),
        hint: t('Flippers : chiffre · Start : valider · Exit : annuler'),
        ...(busy ? { status: error('busy') } : waiting ? { status: t('Nouvel essai dans {seconds} s', { seconds: waiting }) } : status ? { status } : {}),
      };
    },
  };
}
