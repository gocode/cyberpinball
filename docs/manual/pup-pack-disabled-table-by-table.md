[Français](../manuel/pup-pack-desactive-table-par-table.md) · English · [Manual contents](../manual.md)

## PuP-Pack disabled, table by table

To bring a table back to its simplest state, without its videos, and then put them back: table details > "Game parts" > "PuP-Pack" > "Disable the PuP-Pack".
The details screen then shows "PuP-Pack · disabled", and the same part offers "Re-enable the PuP-Pack".
From a pack's options screen (details > "PuP-Pack"), "Disable the PuP-Pack" leads to the same place.

**What happens.**
The pack folder moves from `<table>\pupvideos\<pack>` to `<table>\pupvideos (off)\<pack>`, as it is: a single rename inside the table folder, instant even for several gigabytes, with no copy.
The VPX 10.8.1 PUP plugin only looks for the pack under `pupvideos\<name>` (next to the table, then in the PinUP Player folder set in VPX); PinUP Popper only reads `PinUPSystem\PUPVideos`.
For the game, it is therefore a table without a pack: the script creates the PuP object, `B2SInit` finds nothing, the game goes on without videos.
Re-enabling puts the folder back: same files, same dates, same option remembered in the `.info`.

**The script.**
When Cyber Pinball had adapted the table's `.vbs` for the pack (`usePUP` switch on, start added, DMD frame recognition), it puts it back like the table's script: only the `core.vbs` fixes remain, and a `.vbs` that had nothing else goes to the trash.
Without a pack, a switch left on would get in the way of the game: a lit PuP-DMD leaves the DMD without a score, and *2001: A Space Odyssey* only plays its music when `usePUP` is false.
On re-enabling, the `.vbs` is redone identically.
A `.vbs` from elsewhere is not touched.

**Nothing switches it back on.**
The doctor says "PuP-Pack disabled" (information) and asks for nothing; the repairs made before every game put the script back without PuP, never the pack; cabinet health and "What's missing to play" count it as done; "Game parts" neither searches nor offers a pack to download for it; sharing with friends does not send it; a pack update installed through the add plan is stored in `pupvideos (off)` and stays disabled.

**Shared pack.**
`pupvideos` is shared by the tables of one folder: the other versions that load the same pack (same ROM, same name) also play without it.
The confirmation screen names them before disabling, and they say "disabled" too; the pack can be re-enabled from any of them.

**Safety.**
The state lives on the disk and nowhere else: a pack is disabled as long as its folder is in `pupvideos (off)` and not in `pupvideos`.
If a rename fails (a pack file open in VPX or Explorer), those already done are undone and the message says so: nothing is half disabled.
If the application stops between moving the pack and putting the script back, preparing the next game puts the script back.
A pack of the same name put back in `pupvideos` meanwhile wins: re-enabling never overwrites it.

**Limit.**
If the VPX "PinUP Player folder" setting (`[Plugin.PUP] PUPFolder`) points to a collection that also has this pack, the plugin will load that one: the confirmation screen says so.
