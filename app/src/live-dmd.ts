// DMD du menu vivant (packages/core/src/livedmd.ts) : le processus principal fait tourner le
// programme de la table montrée et envoie chaque image changée à la fenêtre de l'écran du DMD
// (canal « dmd », app/renderer/frontend.js). Une image fixe part une fois ; seules les pages qui
// bougent (défilement, clignotement, horloge, transitions) sont recalculées 25 fois par seconde.
//
// API pour les autres parties du menu (Lancement en cinéma…) :
//   const anim = liveDmd.play('chargement', { label: 'LOADING' });
//   await anim.done;   // fin de l'animation (une animation sans durée tourne jusqu'à anim.stop())
//   anim.stop();       // l'alternance reprend
// Rien n'est envoyé pendant une partie : VPX a l'afficheur (pause / resume).
//
// D'une table à l'autre, la nouvelle alternance glisse sur l'ancienne image dans le sens de la
// roue (240 ms) ; la wheel décodée en retard (dmd-wheel.ts) s'ajoute tant que son détail n'a pas
// encore dû jouer.

import {
  DMD_TRANSITIONS,
  LIVE_DMD_SCENES,
  LIVE_DMD_TIMING,
  dmdAnimation,
  liveDmdProgram,
  sameDots,
  type DmdAnimation,
  type DmdAnimationName,
  type DmdAnimationOptions,
  type DmdDots,
  type LiveDmdInput,
  type LiveDmdProgram,
} from '@cyberpinball/core';

/** Ce que reçoit la fenêtre : les points à dessiner. */
export interface LiveDmdShotMessage {
  dots: DmdDots;
}

export interface LiveDmdOptions {
  send(shot: LiveDmdShotMessage): void;
  /** Horloge des essais. */
  now?: () => number;
}

export interface LiveDmdAnimationHandle {
  stop(): void;
  /** Résolue à la fin de l'animation, ou quand elle est arrêtée ou remplacée. */
  done: Promise<void>;
}

/** Trame des pages qui bougent, en ms (25 images par seconde, comme les vrais DMD). */
const FRAME_MS = 40;
/** Relecture d'une page fixe : rien n'est renvoyé tant qu'elle ne change pas. */
const IDLE_MS = 120;

interface Running {
  name: string;
  start: number;
  duration?: number;
  dots: (elapsed: number) => DmdDots;
  finish: () => void;
}

export class LiveDmd {
  private program?: LiveDmdProgram;
  private subjectKey?: string;
  private start = 0;
  private timer?: NodeJS.Timeout;
  private paused = true;
  private animation?: Running;
  private last?: LiveDmdShotMessage;
  /** La wheel de la table montrée est dans le programme. */
  private hasWheel = false;
  /** Glissement en cours depuis l'image de la table d'avant. */
  private handoff?: { from: DmdDots; start: number; dir: 1 | -1 };
  private readonly now: () => number;

  constructor(private readonly options: LiveDmdOptions) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Table montrée (ou aucune) : `key` dit quand c'est une autre table, ou la même dont les
   * records ont changé ; elle ne compte pas la wheel. Une autre table repart du titre, glissée
   * sur l'image d'avant dans le sens `dir` de la roue (1 : vers la suivante). La même table dont
   * la wheel arrive : elle s'ajoute sans rien relancer, si son détail n'a pas encore dû jouer.
   */
  show(key: string, input: LiveDmdInput | undefined, dir: 1 | -1 = 1): void {
    if (key === this.subjectKey && this.program) {
      if (input?.wheel && !this.hasWheel && this.now() - this.start < LIVE_DMD_SCENES.wheelAfter) {
        this.program = liveDmdProgram(input);
        this.hasWheel = true;
      }
      return;
    }
    const before = this.last?.dots;
    this.subjectKey = key;
    this.program = liveDmdProgram(input);
    this.hasWheel = Boolean(input?.wheel);
    this.start = this.now();
    this.handoff = before && !this.paused && !this.animation ? { from: before, start: this.start, dir } : undefined;
    this.tick();
  }

  /** Le programme courant, pour les essais. */
  current(): LiveDmdProgram | undefined {
    return this.program;
  }

  /** Joue une animation par-dessus l'alternance ; celle qui jouait s'arrête. */
  play(name: DmdAnimationName, options?: DmdAnimationOptions): LiveDmdAnimationHandle {
    return this.custom(name, dmdAnimation(name, options));
  }

  /** Joue une animation fournie par une autre partie du menu (Juke-box : sélection, spectre). */
  custom(name: string, animation: DmdAnimation): LiveDmdAnimationHandle {
    this.animation?.finish();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    const running: Running = {
      name,
      start: this.now(),
      duration: animation.duration,
      dots: (e) => animation.dots(e),
      finish: () => {
        if (this.animation === running) this.animation = undefined;
        finish();
      },
    };
    this.animation = running;
    this.tick();
    return {
      done,
      stop: () => {
        if (this.animation !== running) return;
        running.finish();
        this.tick();
      },
    };
  }

  /** Animation en cours, pour les essais. */
  playing(): string | undefined {
    return this.animation?.name;
  }

  /** Partie en cours, DMD classique ou écran du DMD absent : plus rien n'est envoyé. */
  pause(): void {
    this.paused = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.last = undefined;
  }

  /** Reprise (retour de partie, du bureau Windows) : l'alternance repart du titre. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.start = this.now();
    this.handoff = undefined;
    this.tick();
  }

  /** Renvoie l'image courante (fenêtre rechargée ou recréée). */
  resend(): void {
    this.last = undefined;
    this.tick();
  }

  dispose(): void {
    this.animation?.finish();
    this.pause();
  }

  private tick(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.paused) return;
    const now = this.now();
    let shot: LiveDmdShotMessage;
    let moving: boolean;
    const anim = this.animation;
    if (anim && anim.duration !== undefined && now - anim.start >= anim.duration) anim.finish();
    if (this.animation) {
      shot = { dots: this.animation.dots(now - this.animation.start) };
      moving = true;
    } else if (this.program) {
      const at = this.program.at(now - this.start);
      shot = { dots: at.dots };
      moving = at.moving;
      const slide = this.handoff;
      if (slide && now - slide.start < LIVE_DMD_TIMING.slide) {
        shot = { dots: DMD_TRANSITIONS.slide(slide.from, at.dots, (now - slide.start) / LIVE_DMD_TIMING.slide, slide.dir) };
        moving = true;
      } else this.handoff = undefined;
    } else return;
    if (!this.last || !sameDots(shot.dots, this.last.dots)) {
      this.last = shot;
      this.options.send(shot);
    }
    this.timer = setTimeout(() => this.tick(), moving ? FRAME_MS : IDLE_MS);
  }
}
