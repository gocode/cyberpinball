// « En train d'écrire » (17/11/2026) : dans un fil entre amis, un groupe ou un salon, les trois petits
// points animés, avec le pseudo et l'avatar de qui écrit, tant qu'il a du texte en cours dans son champ
// (clavier à l'écran, vrai clavier, téléphone).
//
// Un signal éphémère, jamais gardé dans un fichier :
// - qui écrit envoie « j'écris » à sa première frappe, puis de nouveau au plus toutes les
//   TYPING_REFRESH_MS tant qu'il tape ; « je n'écris plus » quand il vide son champ, l'envoie ou le quitte ;
// - qui reçoit montre les points TYPING_FRESH_MS après le dernier signal : un joueur qui s'arrête de
//   taper, ou dont la borne s'éteint, les voit disparaître d'eux-mêmes ; sa ligne arrivée les retire aussi.
// Une borne d'avant ce signal ne l'envoie pas et ignore celui des autres : rien ne change chez elle.
//
// Ici, rien du réseau : l'envoi limité (createTypingSender) et le tableau de qui écrit (createTypingBoard).

/** Un signal « j'écris » toutes les 3 secondes au plus, tant qu'on tape. */
export const TYPING_REFRESH_MS = 3000;
/** Les points restent 8 secondes après le dernier signal (plus de deux signaux manqués). */
export const TYPING_FRESH_MS = 8000;
/** Joueurs nommés au plus dans un salon ; au-delà, « +n ». */
export const TYPING_SHOWN_MAX = 3;

export interface TypingSender {
  /** Le champ a changé : `active`, il reste du texte ; sinon il est vide. */
  input(active: boolean): void;
  /** Le champ est fermé (envoyé, annulé, quitté) : « je n'écris plus » si besoin. */
  stop(): void;
  /** Un signal « j'écris » est en cours chez les autres. */
  readonly on: boolean;
}

/**
 * L'envoi d'un signal pour une cible (un ami, un groupe, un salon) : limité, et toujours terminé. Un
 * « j'écris » que `send` refuse (rend false : liaison pas encore prête) ne compte pas : la frappe
 * suivante le redit, au lieu d'attendre 3 s sans que personne ne voie rien.
 */
export function createTypingSender(send: (on: boolean) => boolean | void, clock: () => number = Date.now): TypingSender {
  let on = false;
  let last = -Infinity;
  const input = (active: boolean): void => {
    if (active) {
      const t = clock();
      if (on && t - last < TYPING_REFRESH_MS) return;
      if (send(true) === false) return;
      on = true;
      last = t;
      return;
    }
    if (!on) return;
    on = false;
    last = -Infinity;
    send(false);
  };
  return {
    input,
    stop: () => input(false),
    get on() {
      return on;
    },
  };
}

export interface Typist {
  key: string;
  name: string;
  /** Depuis quand il écrit (le premier signal de la série) : l'ordre d'affichage. */
  since: number;
  until: number;
}

export interface TypingBoard {
  /** Un signal reçu de `key` dans `scope` (un ami, un groupe, un salon) ; rend true si l'affichage change. */
  note(scope: string, key: string, name: string, on: boolean): boolean;
  /** Sa ligne est arrivée : ses points partent tout de suite ; rend true s'ils étaient là. */
  clear(scope: string, key: string): boolean;
  /** Qui écrit dans `scope`, le premier arrivé d'abord. */
  who(scope: string): Typist[];
  /** Tout oublier (partage coupé, service arrêté). */
  reset(): void;
  stop(): void;
}

/**
 * Le tableau de qui écrit, chez qui reçoit. `onChange` est appelé quand des points disparaissent
 * d'eux-mêmes (plus de signal depuis TYPING_FRESH_MS) : l'écran se redessine sans attendre.
 */
export function createTypingBoard(onChange: () => void, clock: () => number = Date.now): TypingBoard {
  const scopes = new Map<string, Map<string, Typist>>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function prune(): boolean {
    const t = clock();
    let changed = false;
    for (const [scope, map] of scopes) {
      for (const [key, typist] of map) if (typist.until <= t) changed = map.delete(key) || changed;
      if (!map.size) scopes.delete(scope);
    }
    return changed;
  }

  /** Le prochain départ, réveillé à son heure : l'écran perd les points sans geste de personne. */
  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
    let next = Infinity;
    for (const map of scopes.values()) for (const typist of map.values()) next = Math.min(next, typist.until);
    if (next === Infinity) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (prune()) onChange();
      schedule();
    }, Math.max(50, next - clock() + 20));
    (timer as { unref?: () => void }).unref?.();
  }

  return {
    note(scope, key, name, on) {
      const pruned = prune();
      const map = scopes.get(scope) ?? new Map<string, Typist>();
      const had = map.get(key);
      if (!on) {
        if (!had) return pruned;
        map.delete(key);
        if (!map.size) scopes.delete(scope);
        schedule();
        return true;
      }
      const t = clock();
      map.set(key, { key, name, since: had?.since ?? t, until: t + TYPING_FRESH_MS });
      scopes.set(scope, map);
      schedule();
      return pruned || !had || had.name !== name;
    },
    clear(scope, key) {
      const map = scopes.get(scope);
      if (!map?.delete(key)) return false;
      if (!map.size) scopes.delete(scope);
      schedule();
      return true;
    },
    who(scope) {
      const t = clock();
      return [...(scopes.get(scope)?.values() ?? [])].filter((x) => x.until > t).sort((a, b) => a.since - b.since);
    },
    reset() {
      scopes.clear();
      schedule();
    },
    stop() {
      scopes.clear();
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
