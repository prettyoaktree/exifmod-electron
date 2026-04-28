# Presets and metadata

## The preset catalog

Think of presets as "bundles" of EXIF metadata tags that can be applied in bulk. EXIFmod provides 4 types of preset categories:

| Category    | Presets in this category are used for...                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cameras     | Identifying camera bodies: make and model, fixed or interchangeable lenses, lens details (for fixed lenses), lens mount and adapters (for interchangeable lenses), fixed shutter and/or aperture (because we gotta support those Instamatics). |
| Lenses      | Identifying standalone lenses: make and model, lens mount.                                                                                                                                                                                     |
| Film Stocks | Identifying film stocks: name and ISO/ASA rating (speed).                                                                                                                                                                                      |
| Authors     | Your name and optional copyright (the app adds a " © year " when you use that field because it loves saving you time).                                                                                                                         |

When you start EXIFmod for the first time, it will create a few sample presets to get you started. Change or remove them if you like.

### Why include lens information in camera presets?

To save you time!

- Fixed-lens cameras have only one lens (🤯), so we might as well stuff that lens information into the camera preset. Now, every time you select that Olympus XA camera preset, you are also tagging your file with its built-in Zuiko lens! Time, saved!
- Interchangeable-lens cameras can accept many lenses, but they might not be able to accept **all** the lenses you have. Specifying a lens mount in a camera preset will allow EXIFmod to filter the lens preset list to only show compatible lenses. This can make your workflow much faster if you regularly use multiple systems. 
- OK... but adapters exist... right? Right! If you mark an interchangeable-lens camera preset with "Accepts Adapters", EXIFmod will stop filtering the lens preset list. Only do this for camera bodies with which you regularly use adapters.

## Creating presets

### ... from scratch

1. Open Manage Presets, pick Camera, Lens, Film, or Author, and use the + button next to the category title.
2. The editor opens for a new preset: name it, fill the fields, save. Required fields that are missing are called out in the editor.

### ... from an existing preset (duplicate)

In Manage Presets, use the copy button to duplicate an existing preset. This can save you lots of time when you are building your catalog. Keep in mind that each preset must have a unique name, and must not be completely identical to any other preset (different presets can share some attributes (e.g. "make"), but they can't share **all** attributes.)

### ... from a selected file’s current metadata

If you already have files that you previously tagged with camera, lens, or author information, you can carry over this data into EXIFmod. To do that, select a **single file**, open the **New value** dropdown list for the relevant category, and choose **New preset from metadata…** If that option is not in the list, the file may already match a catalog entry, or you have more than one file selected. 

## Editing other metadata attributes

Additional metadata attributes can be edited with EXIFmod. These do not use presets because they tend to be unique per image. That being said, they can **still be applied in bulk** if you select multiple files.

- Shutter speed - specified as a number of seconds or a fraction of a second, e.g. "2" for 2 seconds, or "1/125" for... you get it.
- Aperture - specified as an f-number, e.g. "1.4", "2", "2.8", "4", etc.
- Description - manually enter an image description, or use a local AI model to generate based on image content.
- Keywords - ditto.
