# Lightroom Classic

EXIFmod ships with a small Lightroom Classic plugin (Mac only for now). You can install it from the app’s Help menu.

In Lightroom, select a file in the library, then use Library → Plug-in Extras → Open in EXIFmod to jump straight to that file in EXIFmod.

## Important: don’t lose Lightroom’s work

Lightroom leans on metadata to remember your edits. If another app rewrites the same file’s metadata, Lightroom can get confused and you can lose edits if you’re not careful.

Best approach

- Use EXIFmod before you do heavy Develop work, when you can. For example: import scans → EXIFmod for metadata → resync the folder in LrC → then your usual convert-with-NLP / edit flow.

If the photo is already developed in Lightroom

- Before you use EXIFmod, make a Develop snapshot (⌘N in Develop on a Mac) for each image you care about. When you’re done in EXIFmod, resync the folder in LrC, load metadata from files if Lightroom asks, then reapply the snapshots as needed. You might still need to nudge rotation, but your edits should come back.

This sounds fussy, but it’s a lot calmer than having Lightroom give you the silent treatment.