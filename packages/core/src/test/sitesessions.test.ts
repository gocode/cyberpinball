// Comptes des sites sources (sitesessions.ts) : état de connexion d'après les cookies de
// la session « Récupérer », site d'un lien, sondes de téléchargement.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOWNLOAD_PROBES, siteOfUrl, siteState, sourceSite, SOURCE_SITES } from '../sitesessions';

const NOW = new Date('2026-10-22T12:00:00Z');
const inDays = (d: number) => NOW.getTime() / 1000 + d * 86400;

test('vpuniverse.com (Invision) : membre connecté, connexion gardée jusqu’à l’expiration de ses clés', () => {
  const vpu = sourceSite('vpuniverse')!;
  assert.deepEqual(siteState(vpu, [], NOW), { connected: false, remembered: false });
  assert.deepEqual(siteState(vpu, [{ name: 'ips4_member_id', value: '0' }], NOW), { connected: false, remembered: false }, 'visiteur');
  assert.deepEqual(siteState(vpu, [{ name: 'ips4_member_id', value: '4242' }], NOW), { connected: true, remembered: false, expires: undefined }, 'pour cette fois seulement');
  const kept = siteState(vpu, [
    { name: 'ips4_member_id', value: '4242', expirationDate: inDays(90) },
    { name: 'ips4_login_key', value: 'abc', expirationDate: inDays(90) },
    { name: 'ips4_device_key', value: 'def', expirationDate: inDays(80) },
  ], NOW);
  assert.equal(kept.connected, true);
  assert.equal(kept.remembered, true);
  assert.equal(kept.expires?.getTime(), inDays(80) * 1000, 'la première clé qui expire');
  // Cookies expirés : plus connecté.
  assert.equal(siteState(vpu, [{ name: 'ips4_member_id', value: '4242', expirationDate: inDays(-1) }], NOW).connected, false);
});

test('vpforums.org (IP.Board 3) et pinballnirvana.com (XenForo) : leurs propres cookies, préfixe accepté', () => {
  const vpf = sourceSite('vpforums')!;
  assert.equal(siteState(vpf, [{ name: 'member_id', value: '17' }, { name: 'pass_hash', value: 'x', expirationDate: inDays(365) }], NOW).remembered, true);
  assert.equal(siteState(vpf, [{ name: 'vpf_member_id', value: '17' }], NOW).connected, true, 'préfixe de cookie du forum');
  const pn = sourceSite('pinballnirvana')!;
  assert.equal(siteState(pn, [{ name: 'xf_session', value: 'invite' }], NOW).connected, false, 'un visiteur a aussi une session');
  assert.equal(siteState(pn, [{ name: 'xf_user', value: '17%2Cclé', expirationDate: inDays(365) }], NOW).remembered, true);
});

test('site d’un lien, et une sonde par moteur', () => {
  assert.equal(siteOfUrl('https://vpuniverse.com/files/file/8179-t2/')?.id, 'vpuniverse');
  assert.equal(siteOfUrl('https://www.vpforums.org/index.php?showfile=7318')?.id, 'vpforums');
  assert.equal(siteOfUrl('https://pinballnirvana.com/forums/resources/x.12/')?.engine, 'xenforo');
  assert.equal(siteOfUrl('https://mega.nz/file/x'), undefined);
  assert.equal(siteOfUrl('pas une adresse'), undefined);
  for (const site of SOURCE_SITES) {
    // Chaque sonde est une expression qui se compile (exécutée dans la page).
    assert.doesNotThrow(() => new Function(`return ${DOWNLOAD_PROBES[site.engine]}`), site.label);
    // Jamais d'adresse fabriquée pour sauter un délai ou une confirmation.
    assert.ok(!/confirm=1|[?&]t=1/.test(DOWNLOAD_PROBES[site.engine]), site.label);
  }
});
