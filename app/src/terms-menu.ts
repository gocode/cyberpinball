// Conditions d'utilisation (packages/core/src/terms.ts) à l'écran, aux boutons de la borne : une
// page par partie du texte, « Page suivante » et « Page précédente » pour le parcourir.
//
// Deux usages :
// - au démarrage du menu, tant que la version en cours n'est pas acceptée (installation sans
//   l'installeur, ou mise à jour qui change le texte) : « J'accepte » l'enregistre dans
//   <données>\conditions.json et reprend le démarrage ; « Je refuse » demande confirmation, puis
//   ferme Cyber Pinball. Exit n'y fait que revenir à la page précédente : on n'en sort pas sans choisir ;
// - Menu système > Cyber Pinball > Conditions d’utilisation : le même texte, à relire, avec la date
//   de l'acceptation.
//
// Sans electron à l'exécution : les tests du cœur peuvent charger ce module.

import { formatDate, readTermsAcceptance, recordTermsAccepted, t, termsAccepted, termsDocument, type TermsAcceptance } from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem } from './library';

export interface TermsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  /** Dossier des données, où l'acceptation est gardée. */
  dataDir: string;
  /** Ferme Cyber Pinball (refus des conditions). */
  quit(): void;
}

export interface TermsMenu {
  /** La version en cours reste-t-elle à accepter ? */
  due(): boolean;
  /** Au démarrage : les conditions à accepter ; `accepted` reprend le démarrage. */
  ask(accepted: () => void): void;
  /** Entrée du menu système : le texte à relire. */
  systemItem: ProvidedSystemItem;
}

export function createTermsMenu(host: TermsMenuHost): TermsMenu {
  let acceptance: TermsAcceptance | undefined = readTermsAcceptance(host.dataDir);
  /** Démarrage en attente de l'accord ; absent : simple lecture depuis le menu système. */
  let pending: (() => void) | undefined;
  let page = 0;
  let refusing = false;

  const show = (at = 0) => host.library.openCustom(build, at);

  function go(to: number): void {
    page = to;
    show(0);
  }

  function accept(): void {
    try {
      acceptance = recordTermsAccepted(host.dataDir);
      console.log(`Conditions d’utilisation acceptées (version ${acceptance.version}).`); // i18n-ignore : journal
    } catch (e) {
      // Fichier impossible à écrire : le démarrage continue, la question reviendra au prochain.
      console.warn(`Conditions d’utilisation : acceptation non enregistrée (${(e as Error).message}).`); // i18n-ignore : journal
    }
    const next = pending;
    pending = undefined;
    next?.();
  }

  function refuseView(): Built {
    return {
      heading: t('Refuser les conditions ?'),
      icon: 'rules',
      lead: t('Cyber Pinball ne s’utilise qu’avec l’accord de ces conditions. Sans lui, il se ferme ; elles vous seront présentées au prochain lancement.'),
      sections: [],
      actions: [
        { label: t('Revoir les conditions'), detail: t('Revenir au texte pour l’accepter'), icon: 'back', run: () => ((refusing = false), show(0)) },
        { label: t('Fermer Cyber Pinball'), detail: t('Sans accepter les conditions'), icon: 'exit', tone: 'error', run: () => host.quit() },
      ],
      back: () => ((refusing = false), show(0)),
    };
  }

  function build(): Built {
    if (refusing) return refuseView();
    const doc = termsDocument();
    const count = doc.sections.length;
    const section = doc.sections[Math.min(page, count - 1)]!;
    const actions: Action[] = [];
    if (page < count - 1) actions.push({ label: t('Page suivante'), detail: doc.sections[page + 1]!.title, icon: 'chevron-right', run: () => go(page + 1) });
    if (page > 0) actions.push({ label: t('Page précédente'), detail: doc.sections[page - 1]!.title, icon: 'chevron-left', run: () => go(page - 1) });
    if (pending) {
      actions.push(
        { label: t('J’accepte'), detail: t('J’ai lu ces conditions et je m’engage à les respecter'), icon: 'check', tone: 'ok', run: accept },
        { label: t('Je refuse'), detail: t('Cyber Pinball se ferme'), icon: 'close', run: () => ((refusing = true), show(0)) },
      );
    }
    const accepted = !pending && acceptance && termsAccepted(acceptance) && acceptance.at ? t('Acceptées le {date}', { date: formatDate(acceptance.at) }) : undefined;
    return {
      heading: doc.title,
      icon: 'rules',
      subheading: [t('Page {n} sur {count}', { n: page + 1, count }), doc.version, accepted].filter(Boolean).join(' · '),
      ...(page === 0 ? { lead: doc.lead } : {}),
      sections: [{ title: section.title, rows: section.paragraphs.map((text) => ({ text })) }],
      actions,
      // Au démarrage, Exit revient en arrière sans jamais quitter l'écran ; en lecture, il ramène au menu système.
      back: () => (page > 0 ? go(page - 1) : pending ? show(0) : host.library.openSystem()),
    };
  }

  return {
    due: () => !termsAccepted(acceptance),
    ask(accepted) {
      pending = accepted;
      page = 0;
      refusing = false;
      show(0);
    },
    systemItem: {
      get detail() {
        return acceptance?.at && termsAccepted(acceptance) ? t('Acceptées le {date} : contenus de tiers, partage, santé, garantie', { date: formatDate(acceptance.at) }) : t('Contenus de tiers, partage, santé, garantie');
      },
      run: () => {
        pending = undefined;
        page = 0;
        refusing = false;
        show(0);
      },
    },
  };
}
