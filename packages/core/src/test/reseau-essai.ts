// Attente commune des tests « entre bornes » sur le testnet de HyperDHT (21/11/2026). Chaque fichier
// avait la sienne, de 15 à 30 s. Sous la charge de plusieurs suites (processeur à 100 %), une
// première recherche dans l'annuaire, une liaison ou une annonce arrivait plus tard que ça, et le
// test tombait sur « attendu : … chez … » alors que seul fichier, il passait. Ce que ces tests
// vérifient, c'est que la chose arrive, pas sa vitesse : l'attente est large, et ne coûte que
// lorsque le test échoue vraiment.

/* eslint-disable @typescript-eslint/no-require-imports */
export const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

/** Attente minimale d'un fait entre bornes. */
export const NETWORK_WAIT_MS = 90_000;

/**
 * Attend que `check` soit vrai ; sinon échoue en disant `what` (et `detail`, s'il est donné).
 * Un `ms` plus court que NETWORK_WAIT_MS est relevé : sous charge, la vitesse n'est pas ce qu'on vérifie.
 */
export async function until(what: string, check: () => boolean, ms = NETWORK_WAIT_MS, detail?: () => string): Promise<void> {
  const end = Date.now() + Math.max(ms, NETWORK_WAIT_MS);
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}${detail ? `\n${detail()}` : ''}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
