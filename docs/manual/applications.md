[Français](../manuel/applications.md) · English · [Manual contents](../manual.md)

## Applications

The **Applications** medallion, in the wheel right after the Jukebox, opens sites full screen on the backglass or on the playfield, in Microsoft Edge: Netflix, YouTube, Twitch, Spotify, your channels, your radio or software in your home (Plex, Home Assistant…).
Edge opens in an app window, with a profile reserved for Cyber Pinball: you sign in to your account the first time and it stays on the cabinet.
- **Navigation with the flippers**: as in the Jukebox, a pressed flipper moves to the previous or next clickable element, which Edge outlines by scrolling the page to it; held, it rewinds or fast-forwards the video, faster and faster.
  The MagnaSaves go left and right.
- **Loading strip**: a thin strip in the application's color runs along the top of the screen while a page loads; you can tell whether your click started a page or did nothing.
  To know this, Edge opens a debugging pipe reserved for Cyber Pinball (no port, nothing listens on your machine), only for the applications; the Jukebox's Google sign-in stays without debugging.
- **Grid icons**: every site has its icon, even when it only offers a small favicon (Netflix, Twitch, a Facebook group) or when its home page is heavy (YouTube).
  A favicon too small to fill its tile sits on it as a crisp badge on the site's color, and the site's share image is used as the icon when there is one; applications left as initials get their icon back the next time the grid opens.
  The cabinet looks for an icon on the Internet once a week (once a day for a site without one), not at every start; the icon of a small-logo site no longer changes size at every tile you step over.
- **An application's settings** (hold Start for 1 s on its tile, or its page): the settings wait until you release Start, so the Screen row no longer flips by itself.
  - **Mobile display**: on, Edge opens with the browser header of an Android phone and the site renders its mobile version; off, the site is shown as on a computer (useful if a site refuses the mobile version).
    As long as you haven't chosen, it follows the screen: on for the playfield (vertical screen), off for the backglass (wide screen); Netflix, on the backglass, no longer offers to install its app.
    Your choice always wins, either way.
  - **Page zoom**: Start steps it from 100% to 300% (100, 125, 150, 175, 200, 250, 300), and the choice is remembered for the application.
    With no choice, the page opens at 200% on the playfield, where the text was too small, and at 100% on the backglass; the setting wins on both screens.
    On the phone, the **A+** and **A−** buttons on the mirror image set the page zoom, one step per press, and this zoom is remembered per site in Cyber Pinball's Edge profile.
- **Translation**: Edge never offers to translate the page anymore (no more "Translate this page?" bubble getting in the way at the cabinet); translation is switched off at every opening, in the Jukebox's sign-in too.
- **Tilted playfield**: an application opened on the playfield is shown the right way up for you, even when the playfield image is tilted; Windows rotates the screen for the time of the application, then puts it back in its orientation when it closes (button, Edge closed or Cyber Pinball quit).
- **Phone**: the phone's touchpad or mirror drives the Edge window (see [The phone as a remote for the built-in browser](the-phone-as-a-remote-for-the-built-in-browser.md)); the remote's volume also sets Edge's sound.
