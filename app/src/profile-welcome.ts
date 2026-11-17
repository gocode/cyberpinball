// Écran « Votre profil de joueur », au démarrage du menu (juste après l'assistant d'écrans de
// l'installation) : choisir son pseudo au clavier à l'écran, et mettre un avatar (avatar-menu.ts :
// une photo ou une image, recadrée aux boutons). Le pseudo est obligatoire : tant qu'il n'est pas
// choisi, « Continuer » reste grisé et Exit ne fait que le rappeler ; l'avatar reste facultatif.
// « Continuer » (ou Exit, une fois le pseudo choisi) reprend le démarrage là où il en était
// (installer VPX, ajouter une table, la roue). Le même réglage reste ensuite dans Menu système >
// Amis > Partage et réseau.
//
// Ouvert à chaque démarrage tant que le profil porte le nom donné d'office (profileWelcomeDue,
// social.ts) ; la date de la première ouverture reste notée dans social.json (profileOffered).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau coupé.

import { avatarView, hasDefaultName, NAME_MAX, NAME_MIN, t } from '@cyberpinball/core';
import type { AvatarMenu } from './avatar-menu';
import { onGesture } from './gesture-flash';
import type { Action, Built, Row } from './library';

export interface ProfileWelcomeHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  };
  net: {
    state(): { key: { publicKey: string }; name: string; avatar?: string };
    rename(name: string): boolean;
    avatarFile(key: string): string | undefined;
    markProfileOffered(): void;
  };
  avatarMenu: Pick<AvatarMenu, 'open'>;
}

export interface ProfileWelcome {
  /** Ouvre l'écran ; `done` : la suite du démarrage (Continuer, ou Exit), une fois le pseudo choisi. */
  open(done: () => void): void;
}

/** Place des actions : la sélection y revient après chaque geste. */
const NAME_AT = 0;
const AVATAR_AT = 1;
const CONTINUE_AT = 2;

export function createProfileWelcome(host: ProfileWelcomeHost): ProfileWelcome {
  let done: () => void = () => undefined;
  let flash: Row | undefined;
  // Montré à chaque dessin jusqu'au geste suivant, jamais effacé par build() (gesture-flash.ts).
  onGesture(() => (flash = undefined));

  const me = () => host.net.state();
  const show = (at: number) => host.library.openCustom(build, at);
  const named = () => !hasDefaultName(me());

  function askName(): void {
    const s = me();
    // Le nom donné d'office ne se garde pas en tapant : le champ part vide.
    host.library.openPrompt(t('Votre pseudo'), t('Pseudo'), hasDefaultName(s) ? '' : s.name, (value) => {
      if (value === undefined) return show(NAME_AT);
      if (!host.net.rename(value)) {
        flash = { text: t('Pseudo refusé : {min} à {max} lettres, chiffres, espaces, tirets ou points', { min: NAME_MIN, max: NAME_MAX }), tone: 'error' };
        return show(NAME_AT);
      }
      // Le nom d'office retapé tel quel (« Joueur A1B2 ») n'est pas un pseudo choisi.
      if (!named()) {
        flash = { text: t('C’est le nom donné d’office : choisissez le vôtre'), tone: 'error' };
        return show(NAME_AT);
      }
      flash = { text: t('Pseudo choisi : {name}', { name: me().name }), tone: 'ok' };
      show(me().avatar ? CONTINUE_AT : AVATAR_AT);
    }, t('De {min} à {max} caractères : lettres, chiffres, espaces, tirets ou points.', { min: NAME_MIN, max: NAME_MAX }));
  }

  /** Continuer, ou Exit : la suite du démarrage, seulement une fois le pseudo choisi. */
  function leave(): void {
    if (named()) return done();
    flash = { text: t('Choisissez d’abord votre pseudo : il est obligatoire pour jouer'), tone: 'warning' };
    show(NAME_AT);
  }

  function build(): Built {
    const s = me();
    const hasName = named();
    const pictured = Boolean(s.avatar);
    // Le message reste jusqu'au geste suivant : l'écran se redessine (changement du profil, 250 ms
    // plus tard) sans le perdre (gesture-flash.ts).
    const rows: Row[] = flash ? [flash] : [];
    rows.push(
      hasName
        ? { text: t('Pseudo : {name}', { name: s.name }), detail: t('Vu tel quel par les autres joueurs, à côté de votre avatar'), tone: 'ok', badges: [t('Choisi')], icon: 'friend-list' }
        : { text: t('Pseudo : à choisir'), detail: t('Obligatoire : c’est le nom que verront les autres joueurs'), tone: 'warning', badges: [t('Obligatoire')], icon: 'friend-list' },
      pictured
        ? { text: t('Avatar : une image à vous'), detail: t('Recadrée en carré, vue à côté de votre pseudo'), tone: 'ok', badges: [t('Choisi')], icon: 'avatar' }
        : { text: t('Avatar : vos initiales en attendant'), detail: t('Facultatif : une photo ou une image, recadrée aux boutons de la borne'), tone: 'info', icon: 'avatar' },
      { text: t('Qui les voit'), detail: t('Vos amis et les classements : votre pseudo et votre avatar, à côté de vos scores publiés. L’annuaire des joueurs : votre pseudo seulement.'), icon: 'eye' },
    );
    const actions: Action[] = [
      { label: hasName ? t('Changer de pseudo…') : t('Choisir mon pseudo…'), detail: t('Au clavier à l’écran, de {min} à {max} caractères', { min: NAME_MIN, max: NAME_MAX }), icon: 'edit', ...(hasName ? {} : { tone: 'ok' as const }), run: askName },
      {
        label: pictured ? t('Changer d’avatar…') : t('Mettre un avatar…'),
        detail: t('Une image de ce PC ou du web, recadrée aux boutons'),
        icon: 'image',
        ...(hasName && !pictured ? { tone: 'ok' as const } : {}),
        // Revenu sans avatar : la sélection reste dessus, pas sur « Continuer ».
        run: () => host.avatarMenu.open(() => show(me().avatar ? CONTINUE_AT : AVATAR_AT)),
      },
      hasName
        ? { label: t('Continuer'), detail: t('Tout se change plus tard : Menu système > Amis > Partage et réseau'), icon: 'check', ...(pictured ? { tone: 'ok' as const } : {}), run: leave }
        : { label: t('Continuer'), detail: t('Choisissez d’abord votre pseudo'), icon: 'check', tone: 'quiet', run: leave },
    ];
    return {
      heading: t('Votre profil de joueur'),
      icon: 'account',
      avatar: avatarView(s.key.publicKey, s.name, host.net.avatarFile(s.key.publicKey)),
      ...(hasName ? { subheading: s.name } : {}),
      lead: t('Bienvenue ! Choisissez votre pseudo : c’est le nom que verront les autres joueurs, dans les classements, la Communauté et entre amis. L’avatar est facultatif. Tout se change plus tard.'),
      sections: [{ rows }],
      actions,
      back: leave,
    };
  }

  return {
    open(then) {
      done = then;
      // Date de la première ouverture, gardée pour mémoire : l'écran revient tant que le pseudo manque.
      host.net.markProfileOffered();
      show(NAME_AT);
    },
  };
}
