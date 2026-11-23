// Les partitions système et les petits disques presque vides ne sont pas « presque pleins ».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { techBlocks, type TechFacts } from '../techsheet';

test('espace disque : les petites partitions presque vides restent listées sans fausse alerte', () => {
  const disk = (size?: number, free?: number) => ({ root: 'D:/', size, free });
  const check = (d: NonNullable<NonNullable<TechFacts['pc']>['disks']>[number]) => techBlocks({ at: '2026-11-23', pc: { disks: [d] } }).find((b) => b.id === 'pc')!;
  for (const d of [disk(500e6, 460e6), disk(8e9, 5e9), disk(500e9, 262e9)]) {
    const b = check(d);
    assert.ok(b.sections.some((s) => s.rows.some((r) => r.label.includes('D:'))));
    assert.doesNotMatch(b.summary, /disque presque plein/);
  }
  for (const d of [disk(500e9, 5e9), disk(8e9, 100e6), disk(undefined, 1e9)]) assert.match(check(d).summary, /disque presque plein/);
});
