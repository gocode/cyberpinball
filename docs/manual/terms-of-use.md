[Français](../manuel/conditions-d-utilisation.md) · English · [Manual contents](../manual.md)

## Terms of use

Cyber Pinball supplies no table, ROM or media from any commercial game: its terms of use state what the user is responsible for and exclude any warranty.
They cover third-party content (copyright, trademarks, manufacturers' ROMs), sharing between cabinets (on by default; a declaration of rights for a ROM or PuP-Pack fetched from a friend), third-party sites and services, commercial use (VPX licence, places open to the public), health and safety (photosensitive epilepsy, virtual reality, cabinet hardware), the absence of warranty and limitation of liability, data, and how they change.
They do not restrict the GPL licence of the code.

- **A single text**, in [packages/core/src/terms.ts](../../packages/core/src/terms.ts), translated like the rest of the interface.
  `TERMS_VERSION` is its date: change it when the substance of the text changes, so that it is shown to everyone again.
- **At installation**: the installer's "Conditions d'utilisation" page, with "I accept" (see [Windows installer](installation-and-file-layout.md#windows-installer)).
- **When the menu starts**, as long as `<data>\conditions.json` does not hold the current version (installation without the installer, or an update that changes the text): one screen per part of the text, with the cabinet buttons ([app/src/terms-menu.ts](../../app/src/terms-menu.ts)), before "Your player profile" and after the opening.
  "I accept" records it and resumes the startup; "I decline" asks for confirmation, then closes Cyber Pinball.
  Exit only goes back to the previous page.
  Not in guest mode nor during an unattended test (unless `CYBERPINBALL_CONDITIONS=1`).
- **To read again** in System menu > Cyber Pinball > Terms of use, with the date it was accepted.

Safeguard: [terms.test.ts](../../packages/core/src/test/terms.test.ts) checks the text in both languages, its form for the installer, and that the application reads back the file written by the installer.
