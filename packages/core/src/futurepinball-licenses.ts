// i18n-ignore-file : contrats en anglais, langue d'origine, montrés tels qu'ils sont écrits.
// Les deux contrats de Future Pinball et de BAM, mot pour mot (24/11/2026), tels que l'installateur
// « FP-BAM-setup.exe » (empreinte dans FUTURE_PINBALL_LICENSES_REVIEWED_FOR) les montre :
//  - le contrat de Future Pinball (Chris Leathley) n'existe que dans l'en-tête de l'installateur, qui le
//    montre sur sa page de licence ; copié ici de cet en-tête, paragraphe par paragraphe ;
//  - le contrat de BAM (Rafal Janicki) est le fichier BAM\License.txt de l'installateur, aussi livré
//    dans le dossier du jeu (il doit y rester : la redistribution l'exige, fichiers inchangés et complets).
// Ils restent en anglais, langue d'origine : un contrat se montre tel qu'il est écrit, sans traduction.
// Cyber Pinball les montre en entier et attend l'accord du joueur avant d'extraire quoi que ce soit
// (app/src/futurepinball-ui.ts), puis le garde (futurepinball-managed.ts, recordFuturePinballLicensesAccepted).
//
// Ces textes valent pour CET installateur. Si l'installateur change dans le manifeste de l'installateur
// (composant « future-pinball »), le test futurepinball-managed.test.ts échoue : relire les contrats de
// la nouvelle version, mettre à jour ces textes et FUTURE_PINBALL_LICENSES_REVIEWED_FOR.

export type FuturePinballLicenseId = 'future-pinball' | 'bam';

export interface FuturePinballLicense {
  id: FuturePinballLicenseId;
  /** Auteur, tel que le contrat le nomme. */
  author: string;
  /** Les paragraphes du contrat, dans l'ordre ; un paragraphe peut tenir sur plusieurs lignes. */
  paragraphs: string[];
}

/** SHA-256 de l'installateur dont ces contrats ont été relus. */
export const FUTURE_PINBALL_LICENSES_REVIEWED_FOR = '7490e5cb649e4b0fe34b934539b1c83694d05819e1ec837c049c5210af3ef736';

export const FUTURE_PINBALL_LICENSES: readonly FuturePinballLicense[] = [
  {
    id: 'future-pinball',
    author: 'Chris Leathley',
    paragraphs: [
    "End User License Agreement for Future Pinball",
    "IMPORTANT-READ CAREFULLY:",
    "This End-User License Agreement (\"EULA\") is a legal agreement between you (either an individual or a single entity) and Chris Leathley for the Future Pinball software accompanying this EULA, which includes computer software and may include associated media, printed materials, and \"online\" or electronic documentation (\"SOFTWARE PRODUCT\" or \"SOFTWARE\").",
    "By exercising your rights to make and use copies of the SOFTWARE PRODUCT, you agree to be bound by the terms of this EULA.",
    "If you do not agree to the terms of this EULA, you may not use the SOFTWARE PRODUCT.",
    "Software PRODUCT LICENSE",
    "The SOFTWARE PRODUCT is protected by copyright laws and international copyright treaties, as well as other intellectual property laws and treaties. The SOFTWARE PRODUCT is licensed, not sold.",
    "1. GRANT OF LICENSE. This EULA grants you the following rights:",
    "Reproduction and Distribution -",
    "You may reproduce and distribute copies of the SOFTWARE PRODUCT; provided that:",
    "a) each copy shall be a true and complete copy, including all copyright and trademark notices;",
    "b) each copy shall be accompanied by a copy of this EULA;",
    "c) such distribution shall not be for commercial purposes without express permission granted by Chris Leathley.",
    "d) such distribution shall not be for Magazine CD Publication without express permission granted by Chris Leathley.",
    "2. DESCRIPTION OF OTHER RIGHTS AND LIMITATIONS.",
    "Limitations on Reverse Engineering, Decompilation, and Disassembly -",
    "You may not reverse engineer, decompile, or disassemble the SOFTWARE PRODUCT, except and only to the extent that such activity is expressly permitted by applicable law notwithstanding this limitation.",
    "Separation of Components - The SOFTWARE PRODUCT is licensed as a single product. Its component parts may not be separated for use on more than one computer.",
    "This software is Time Limited. It will expire one year after it's initial release to ensure that old versions of the software will eventually be updated to the current version of the software.",
    "Software Transfer -",
    "You may permanently transfer all of your rights under this EULA, provided the recipient agrees to the terms of this EULA.",
    "Termination -",
    "Without prejudice to any other rights Chris Leathley may terminate this EULA if you fail to comply with the terms and conditions of this EULA. In such event, you must destroy all copies of the SOFTWARE PRODUCT and all of its component parts.",
    "3. COPYRIGHT.",
    "All title and copyrights in and to the SOFTWARE PRODUCT (including, but not limited to, any images, photographs, animations, video, audio, music, text, and \"applets\" incorporated into the SOFTWARE PRODUCT), the accompanying printed materials, and any copies of the SOFTWARE PRODUCT are owned by Chris Leathley. The SOFTWARE PRODUCT is protected by copyright laws and international treaty provisions. Therefore, you must treat the SOFTWARE PRODUCT like any other copyrighted material.",
    "4. LIMITED WARRANTY. NO WARRANTIES.",
    "Chris Leathley expressly disclaims any warranty for the SOFTWARE PRODUCT.",
    "The SOFTWARE PRODUCT and any related documentation is provided \"as is\" without warranty of any kind, either express or implied, including, without limitation, the implied warranties or merchantability, fitness for a particular purpose, or noninfringement.",
    "The entire risk arising out of use or performance of the SOFTWARE PRODUCT remains with you.",
    "6. NO LIABILITY FOR CONSEQUENTIAL DAMAGES.",
    "In no event shall Chris Leathley be liable for any damages whatsoever (including, without limitation, damages for loss of business profits, business interruption, loss of any business information, or any other pecuniary loss) arising out of the use of or inability to use this product, even if Chris Leathley has been advised of the possibility of such damages. Because some states/jurisdictions do not allow the exclusion or limitation of liability for consequential or incidental damages, the above limitation may not apply to you.",
    "No affiliation, partnership, joint-venture or relationship of any kind or form exists with any other companies, products or services that may be referenced, and should not be implied or inferred by any references, or the lack thereof.",
  ],
  },
  {
    id: 'bam',
    author: 'Rafal Janicki',
    paragraphs: [
    "This software is provided 'as-is', without any express or implied warranty.\nYOU BEAR THE RISK OF USING IT.\nIn no event will the authors be held liable for any damages arising from the use of this software.",
    "End User Licence Agreement (EULA)",
    "Herein \"WE\" and \"AUTHOR\" shall refer to all BAM contributors and Rafal Janicki,\n\"PRODUCT\" shall refer to products developed and provided,\n\"SERVICES\" shall refer to services developed and provided ,\n\"USER\" shall refer to you, the user (either as an individual, single entity or group).",
    "This End User Licence Agreement (EULA) is an agreement between you, the USER and the mentioned AUTHOR. By using the mentioned AUTHOR's PRODUCTS, SERVICES and all other documents associated with and/or accompanying such, you agree to have read, fully understand and agree to be bound by, the terms set out below.",
    "I.\tProducts\nII.\tServices\nIII.\tLicence\nIV.\tDistribution\nV.\tDistribution Restrictions\nVI.\tEULA Modifications",
    "I.\tPRODUCTS\nAll PRODUCTS and accompanying materials provided by the AUTHOR, are provided \"as is\", without warranty. By using the PRODUCTS, you agree not to hold the AUTHOR liable for any damages that may occur.",
    "II.\tSERVICES\nAll SERVICES and accompanying materials provided by the AUTHOR, are provided \"as is\", without warranty. By using the SERVICES, you agree not to hold the AUTHOR liable for any damages that may occur. Further you agree that SERVICES may be discontinued at any time, without prior notification.",
    "III.\tLICENCE\nUnder the terms of this agreement, a non-exclusive [FREEWARE] licence is granted to the USER on the understanding the AUTHOR retains ALL rights to SERVICES, PRODUCTS, written materials and other such supplies.",
    "Under this agreement, you are free to download and/or use the SERVICES and PRODUCTS provided by the AUTHOR for both personal and commercial use, but are NOT permitted to attempt to modify, de-compile, merge, sell, lease or otherwise mis-use said AUTHOR's PRODUCTS and/or SERVICES, including but not limited to, all graphics, documents and other such file's.",
    "IV.\tDISTRIBUTION\nUnder the terms of this agreement, the AUTHOR grants you a non-exclusive licence to re-distribute all PRODUCTS provided by said AUTHOR, on the understanding no attempt is made to sell or otherwise personally or financially gain from the distribution of such PRODUCTS. All file's provided MUST remain unchanged and in full, including, but not limited to: Readme, EULA, DISTRIBUTION, Help, PRODUCT and all other such file's.",
    "V.\tDISTRIBUTION RESTRICTIONS\nWhilst the AUTHOR grants you permission to distribute said AUTHOR's PRODUCTS, the following restrictions apply in all cases where the PRODUCT and/or SERVICE has been developed and/or [is] provided by, said AUTHOR.\nYou may not list any of the AUTHOR's PRODUCTS on website's that charge for access to listings, downloadable file's or other such material.\nYou may not \"bundle\" ANY of said AUTHOR's products with ANY product and/or service that has not been developed and/or [is] provided by said AUTHOR.\nUnder the terms of this agreement, distribution of SERVICES provided by the AUTHOR is expressly forbidden unless written permission has been granted by said AUTHOR. In cases where written permission has been given, said AUTHOR reserves the right to charge a nominal fee to cover potential administration costs and/or costs related to source file's.",
    "VI.\tEULA MODIFICATIONS\nThe afformentioned AUTHOR reserves the right to modify this EULA at any time, without notice. Should such a modification take place, the USER is expected to read and agree to such modifications within 7 days. Failure to agree to such modifications shall require said USER cease using said AUTHOR's PRODUCTS and/or SERVICES.",
  ],
  },
];
