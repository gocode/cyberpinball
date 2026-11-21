// Arguments communs de chaque lancement de node --test (vérifier, contrôles, avant-fusion).
// console-sur-stderr.mjs : la console des tests ne se mêle pas aux résultats sérialisés de node --test.

import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const NODE_TEST_ARGS = ['--import', pathToFileURL(path.join(here, 'console-sur-stderr.mjs')).href, '--test'];
