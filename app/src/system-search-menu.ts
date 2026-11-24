// Recherche dans le Menu système (22/11/2026) : « Aide et infos > Rechercher », ou une lettre tapée sur un
// vrai clavier depuis un écran du Menu système. Le clavier à l'écran montre les résultats à chaque lettre,
// entre le texte et les touches ; un clic en ouvre un, OK (ou Entrée, ou Valider au téléphone) les montre
// tous dans une liste qu'on parcourt aux flippers. Un résultat ouvert revient à cette liste par « Retour ».
//
// Ce que la recherche trouve et comment elle classe : packages/core/src/systemsearch.ts. Ce module ne fait
// que les écrans et l'ouverture d'un résultat (une rubrique, une entrée, ou un réglage dans un sous-écran).

import { placeNames, placeTargets, searchKey, searchPathText, searchSystem, SYSTEM_ITEMS, t, tn, type SearchResult, type SystemEntryId, type SystemGroupId, type SystemItemId } from '@cyberpinball/core';
import type { Input } from 'electron';
import type { Action, Built, PromptLive, PromptOptions, ProvidedSystemItem } from './library-types';

/** Résultats montrés sous le texte, pendant la saisie : le clavier reste entier sur l'écran. */
export const LIVE_RESULTS = 5;
/** Résultats de la liste complète : au-delà, il vaut mieux préciser la recherche. */
export const MAX_RESULTS = 40;

export interface SystemSearchHost {
  library: {
    provideSystemItem(id: SystemItemId, item: ProvidedSystemItem): void;
    provideTypeToSearch(open: (char: string) => void): void;
    systemShown(id: SystemEntryId): boolean;
    systemHere(): { group: SystemGroupId | undefined; at: SystemEntryId | undefined } | undefined;
    openSystemAt(group: SystemGroupId | undefined, at?: SystemEntryId): void;
    openSystemGroupFrom(group: SystemGroupId, back: () => void): void;
    runSystemItem(id: SystemItemId, back: () => void): void;
    reachSystemPlace(parent: SystemItemId, steps: readonly (readonly string[])[], targets: readonly string[], back: () => void): Promise<boolean>;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string, options?: PromptOptions): void;
    openCustom(build: () => Built, at?: number): void;
    typedChar(input: Input): string | undefined;
  };
}

export function createSystemSearch(host: SystemSearchHost) {
  const { library } = host;

  /** Les résultats pour ce texte, seulement ce que le menu montre sur cette borne. */
  const find = (query: string): SearchResult[] => searchSystem(query, (id) => library.systemShown(id)).slice(0, MAX_RESULTS);

  /** Ouvre un résultat ; son « Retour » ramène à la liste des résultats de `query`. */
  function choose(result: SearchResult, query: string, back: () => void): void {
    const again = () => showResults(query, back);
    const target = result.target;
    if (target.kind === 'group') return library.openSystemGroupFrom(target.id, again);
    if (target.kind === 'item') return library.runSystemItem(target.id, again);
    const place = target.place;
    void library.reachSystemPlace(
      place.parent,
      (place.steps ?? []).map((s) => placeNames(s).map((n) => n.key)),
      placeTargets(place).map((n) => n.key),
      again,
    );
  }

  /** La saisie, les résultats à chaque lettre ; `back` : là d'où l'on vient (Aide et infos, l'écran où l'on a tapé). */
  function open(initial: string, back: () => void): void {
    const live: PromptLive = {
      rows: (text) => {
        if (!text.trim()) return { rows: [], empty: t('Tape le nom d’un réglage ou un mot : « logo », « volume », « wifi »…') };
        const results = find(text);
        if (!results.length) return { rows: [], empty: t('Aucun réglage ne correspond à « {query} ».', { query: text.trim() }) };
        const footer = results.length > LIVE_RESULTS ? tn(results.length, 'OK : le résultat', 'OK : les {n} résultats') : t('OK : la liste, à parcourir aux flippers');
        return { rows: results.slice(0, LIVE_RESULTS).map((r) => ({ label: r.label, detail: searchPathText(r) })), footer };
      },
      pick: (text, index) => {
        const result = find(text)[index];
        if (result) choose(result, text, back);
      },
    };
    library.openPrompt(
      t('Rechercher dans le Menu système'),
      t('Réglage, rubrique ou mot-clé'),
      initial,
      (value) => {
        if (value === undefined || !value.trim()) return back();
        showResults(value.trim(), back);
      },
      undefined,
      { live },
    );
  }

  /** Tous les résultats, en liste : les flippers les parcourent, Start en ouvre un. */
  function showResults(query: string, back: () => void): void {
    const build = (): Built => {
      const results = find(query);
      // Pas d'icônes : les réglages d'un même écran auraient tous la sienne (deux lignes d'un menu n'en partagent jamais une).
      const actions: Action[] = results.map((r) => ({ label: r.label, detail: searchPathText(r), key: searchKey(r.target), run: () => choose(r, query, back) }));
      actions.push({ label: t('Modifier la recherche'), key: 'search:edit', run: () => open(query, back) }, { label: t('Retour'), key: 'search:back', run: back });
      return {
        heading: t('Rechercher'),
        icon: SYSTEM_ITEMS.search.icon,
        subheading: t('« {query} »', { query }),
        lead: results.length ? tn(results.length, '{n} résultat', '{n} résultats') : t('Aucun réglage ne correspond à « {query} ».', { query }),
        sections: [],
        actions,
        back,
        // Une lettre tapée sur un vrai clavier continue la recherche, comme sur le clavier à l'écran.
        keys: (input) => {
          const char = library.typedChar(input);
          if (!char) return false;
          open(query + char, back);
          return true;
        },
      };
    };
    library.openCustom(build, 0);
  }

  // « Aide et infos > Rechercher » : son « Retour » ramène sur cette entrée.
  library.provideSystemItem('search', {
    get detail() {
      return t('Un réglage ou une rubrique, par son nom ou un mot-clé ; ou tape une lettre dans le Menu système');
    },
    run: () => {
      const here = library.systemHere();
      open('', () => library.openSystemAt(here?.group ?? 'aide', here?.at ?? 'search'));
    },
  });

  // Une lettre tapée sur un vrai clavier dans le Menu système : la recherche s'ouvre avec elle.
  library.provideTypeToSearch((char) => {
    const here = library.systemHere();
    open(char, () => library.openSystemAt(here?.group, here?.at));
  });

  return { open, find };
}
