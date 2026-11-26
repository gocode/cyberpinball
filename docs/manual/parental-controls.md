[Français](../manuel/controle-parental.md) · English · [Manual contents](../manual.md)

## Parental controls

Use **System menu → My cabinet → Parental controls** to set a four-digit PIN and protect one or more collections or individual tables.
Protection starts disabled.
The owner chooses and confirms the PIN on the cabinet before enabling protection.
The current PIN is required to change settings, disable protection or choose a different code.

Protecting a collection protects all its tables, including when they appear under All tables, Favorites, Recently played or another collection.
Individual protection follows a table when its game file is replaced in the same folder.
Versions that share that folder receive the same protection.
Review the protection after manually moving a table to another folder.
Cyber and game engine updates keep protection settings in the cabinet's data folder.

On the cabinet, use the flippers to cycle the active digit between 0 and 9 in either direction.
Press **Start** to accept one digit or **Exit** to cancel.
Previous boxes display dots.
After five unsuccessful attempts, wait one minute between attempts.
The delay survives a restart.

The correct PIN opens the requested table or collection.
A collection can stay open for several games until you change collection or user mode, manually lock it, restart Cyber or reach the configured idle timeout.
A game in progress continues if the cabinet locks again.
Use **Open a protected collection** or **Open a protected table** in the parental control menu to open a hidden item.
Guest mode keeps its own restrictions and cannot open protected items.

Locked items show the cabinet's fallback media and loading screen.
Table Surprise and attract mode skip protected tables.
Enter the PIN on the cabinet.
The phone can still control ordinary items outside a parental control session.

### Recovery for the Windows owner

If the PIN is lost or the file is unreadable, close Cyber Pinball.
Sign in to the Windows account authorized to administer the cabinet data.
Keep `controle-parental.json` in a location reserved for the owner and remove it from the Cyber data folder.
Start Cyber, choose a new PIN and restore the protected table and collection selection before giving others access to the cabinet.
The file stores a hash derived with scrypt and a random salt.
Cyber cannot display the previous PIN.

The feature protects access through Cyber Pinball.
Use Windows, Steam and any other frontend's controls to restrict access through those applications or to files on disk.
