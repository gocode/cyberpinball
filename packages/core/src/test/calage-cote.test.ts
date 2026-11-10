// Le côté de la borne au calage (essai du 10 novembre 2026 : « devant et derrière », les deux
// gâchettes à 60 ms d'écart, la borne posée dans le dos selon celle qui arrivait la première).

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockbarPlace, orderCorners, placeLockbar, type Point3 } from '../calage';

test('calage : la borne s’étend du côté opposé à la tête, quels que soient l’ordre des coins, la main et la pièce', () => {
  for (let deg = -180; deg < 180; deg += 15) {
    const yaw = (deg * Math.PI) / 180;
    // Le joueur regarde dans la direction `yaw` ; la barre avant 30 cm devant lui, de 50 cm.
    const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const side = { x: -fwd.z, z: fwd.x };
    const head = { x: 0.4, z: -0.2 };
    const mid = { x: head.x + fwd.x * 0.3, z: head.z + fwd.z * 0.3 };
    const a: Point3 = { x: mid.x - side.x * 0.25, y: 1.05, z: mid.z - side.z * 0.25 };
    const b: Point3 = { x: mid.x + side.x * 0.25, y: 1.06, z: mid.z + side.z * 0.25 };
    for (const [p, q] of [[a, b], [b, a]] as const) {
      const [left, right] = orderCorners(p, q, head);
      const place = lockbarPlace(left, right);
      const { left: l, right: r } = placeLockbar(place);
      const bar = { x: (l.x + r.x) / 2, z: (l.z + r.z) / 2 };
      // Vers la borne : de la place du joueur au milieu de la barre ; la tête est de l'autre côté.
      const toCabinet = { x: bar.x - place.x, z: bar.z - place.z };
      const headSide = (head.x - bar.x) * toCabinet.x + (head.z - bar.z) * toCabinet.z;
      assert.ok(headSide < 0, `pièce tournée de ${deg}°, coins ${p === a ? 'a, b' : 'b, a'} : tête du côté de la borne`);
      // Et la borne regarde comme le joueur : son lacet est celui de la tête, à 1° près.
      const d = ((((place.yaw - yaw) * 180) / Math.PI + 540) % 360) - 180;
      assert.ok(Math.abs(d) < 1, `pièce tournée de ${deg}° : lacet de la borne à ${d.toFixed(1)}°`);
    }
  }
});
