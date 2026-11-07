// Guides du jeu rédigés (tableguide.ts), un fichier par table.

import type { TableGuide } from '../tableguide';
import { guide2001 } from './2001';
import { guideBttf } from './bttf';
import { guideCityHunter } from './city-hunter';
import { guideGoonies } from './goonies';
import { guideGot } from './got';
import { guideGotg } from './gotg';
import { guideMatrix } from './matrix';
import { guideStarTrek } from './star-trek';
import { guideT2 } from './t2';
import { guideTwd } from './twd';

export const GUIDES: readonly TableGuide[] = [guide2001, guideBttf, guideCityHunter, guideGoonies, guideGot, guideGotg, guideMatrix, guideStarTrek, guideT2, guideTwd];
