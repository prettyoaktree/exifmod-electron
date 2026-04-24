# EXIFmod — User's Guide

EXIFmod Overview

EXIFmod is a desktop application for photographers and editors who want to **apply consistent EXIF metadata** (camera, lens, film stock, author/copyright, exposure, and notes) across images using a **reusable preset catalog**, then **write those changes into the image files**.

---

## Who it is for

- People who want to quickly edit image metadata with **saved combinations** (bodies, lenses, film stocks, author identity) instead of typing the same EXIF fields repeatedly.
- Works equally well for a single image or a whole folder.

---

## Installation and updates

See **[README.md](../README.md)** for full installation instructions.

---

## Core workflow

1. **Open a folder** to view a list of supported image files.
2. **Select one or more files** in the list.
3. **Review and edit** metadata attributes.
4. **Preview EXIF Changes** (optional... for the techies) to inspect the actual EXIF tags that would be written to your files.
5. **Write Pending Changes** to apply your edits to the selected files.

### Supported formats

EXIFmod supports **JPEG**, **TIFF**, and common **camera RAW** formats. For RAW files, EXIFmod writes metadata to XMP sidecars next to the images. For JPEG and TIFF files, metadata is written directly into the file, with an optional backup copy.

---

## Preset catalog

You can **create**, **edit**, and **delete** presets from the **Manage Presets** panel (gear icon in Metadata pane). Presets are grouped into four categories:


| Category   | Typical use                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Camera** | Defines the camera's body make and model; fixed-lens vs interchangeable system / lens mount; optional fixed shutter or aperture.                             |
| **Lens**   | Defines the lens make and model. If a lens mount is specified, the preset selector will automatically filter compatible lenses based on the selected camera. |
| **Film**   | Defines the film stock and ISO.                                                                                                                              |
| **Author** | Defines the Author name and optional copyright line (written with a < © year > prefix on each file).                                                         |


**NOTE**: On **first launch**, EXIFmod seeds the catalog with example presets to get you started. Feel free to modify or remove them.

---

## Editing metadata

The Metadata pane (right side) enables you to easily view and edit metadata attributes for one or more selected files:

- **Attribute**: the name of the attribute (camera, lens, film, etc.)
- **Current Value**: the value/s read from selected file metadata. When multiple files are selected, Current Value might show "Multiple" if not all files have the same attribute value.
- **New Value:** for cameras, lenses, film stocks, and authors, you will use presets to set new values. For other attributes, you will specify the new values directly. Your edits will be applied as "pending changes" to all selected files.
- **Remove** checkbox: checking this box will **clear** the metadata for the selected attribute. This can be useful if you are trying to get rid of metadata (e.g. added by your scanning software) without replacing it with a different value.

---

## Using generative AI for descriptions and keywords

Not everyone wants to train cloud AI models with their art. For this reason, EXIFmod uses a tool called **Ollama**, to run AI models on your local machine, keeping everything private (neat!). By default, EXIFmod is designed to use Ollama with a model called **gemma4**, which provides extensive image analysis capabilities. You can override the default Ollama comfiguration by using the environment variables **EXIFMOD_OLLAMA_MODEL**, **EXIFMOD_OLLAMA_HOST** (if you don't know what any of this means, don't worry about it.)

If you feel that the generated descriptions and keywords are too short, or too long, or too general, or too specific, you can edit the **System Prompt** that EXIFmod uses to provide instructions to the model. Be very very cautious when editing the system prompt, as it could result is some serious shenanigans. If you do mess it up, EXIFmod allows you to restore the system prompt to the default.

---

## Lightroom Classic integration

EXIFmod provides an LrC plugin that is currently supported only on MacOS. You can install the plugin from the **Help** menu.

With this plugin, you can select any file in your Lightroom Library, then use **Library** → **Plug-in Extras** → **Open In EXIFmod** to open the file in EXIFmod.

### Important!

Lightroom uses EXIF metadata extensively to track the edits you made to your files, and can get very annoyed when another app (like EXIFmod) also updates this metadata. When Lightroom gets annoyed, you might lose your edits!
To save yourself a lot of aggravation, follow these best practices:

- Ideally, use EXIFmod **before** making any serious edits to your photos. For example: import your negative scans → use EXIFmod to edit metadata → resync LrC folder → convert negatives with NLP → proceed with editing.
- If you want to use EXIFmod after you've already made edits in Lightroom, make sure to **create a Develop Snapshot** (⌘+N in the Develop module) for each edited file before proceeding with EXIFmod. When you are done with EXIFmod, resync your Lightroom folder, load metadata from files (if needed), and reapply your snapshots. You may still need to rotate your photos but everything else should be intact.

