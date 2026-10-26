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

import { LiveDmdProgram, dmdAnimation, liveDmdPages, sameDots, type DmdAnimationName, type DmdAnimationOptions, type DmdDots, type LiveDmdInput } from '@cyberpinball/core';

/** Ce que reçoit la fenêtre : des points, ou « montrer le média de la table ». */
export interface LiveDmdShotMessage {
  media: boolean;
  dots?: DmdDots;
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
  name: DmdAnimationName;
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
  private readonly now: () => number;

  constructor(private readonly options: LiveDmdOptions) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Table montrée (ou aucune) : `key` dit quand c'est une autre table, ou la même dont
   * les records ou les médias ont changé. Une autre table repart du titre.
   */
  show(key: string, input: LiveDmdInput | undefined): void {
    if (key === this.subjectKey && this.program) return;
    this.subjectKey = key;
    this.program = new LiveDmdProgram(liveDmdPages(input));
    this.start = this.now();
    this.tick();
  }

  /** Joue une animation par-dessus l'alternance ; celle qui jouait s'arrête. */
  play(name: DmdAnimationName, options?: DmdAnimationOptions): LiveDmdAnimationHandle {
    this.animation?.finish();
    const animation = dmdAnimation(name, options);
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
  playing(): DmdAnimationName | undefined {
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
      shot = { media: false, dots: this.animation.dots(now - this.animation.start) };
      moving = true;
    } else if (this.program) {
      const at = this.program.at(now - this.start);
      shot = { media: at.media, dots: at.dots };
      moving = at.moving;
    } else return;
    if (!this.last || shot.media !== this.last.media || !sameDots(shot.dots, this.last.dots)) {
      this.last = shot;
      this.options.send(shot);
    }
    this.timer = setTimeout(() => this.tick(), moving ? FRAME_MS : IDLE_MS);
  }
}
