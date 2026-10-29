// Catalogue anglais, rangé par partie de l'interface (un fichier par partie, pour
// qu'une clé se retrouve près de ses voisines). Une même clé peut figurer dans deux
// parties, avec la même traduction (vérifié par i18n.test.ts).
import type { Catalog } from '../../i18n';
import { messages as common } from './common';
import { messages as wizard } from './wizard';
import { messages as library } from './library';
import { messages as catalog } from './catalog';
import { messages as media } from './media';
import { messages as downloads } from './downloads';
import { messages as tables } from './tables';
import { messages as settings } from './settings';
import { messages as menu } from './menu';
import { messages as journey } from './journey';
import { messages as waitlist } from './waitlist';
import { messages as files } from './files';
import { messages as webmedia } from './webmedia';
import { messages as health } from './health';
import { messages as dedicated } from './dedicated';
import { messages as power } from './power';
import { messages as hours } from './hours';
import { messages as parts } from './parts';
import { messages as sharing } from './sharing';
import { messages as social } from './social';
import { messages as friends } from './friends';
import { messages as downloadmanager } from './downloadmanager';
import { messages as notices } from './notices';
import { messages as recording } from './recording';

/** Chaque partie du catalogue, par nom de fichier (pour le test des doublons). */
export const EN_PARTS: Readonly<Record<string, Catalog>> = { common, wizard, library, catalog, media, downloads, tables, settings, menu, journey, waitlist, files, webmedia, health, dedicated, power, hours, parts, sharing, social, friends, downloadmanager, notices, recording };

export const EN_MESSAGES: Catalog = Object.assign({}, ...Object.values(EN_PARTS));
