# Getting started

Welcome!

EXIFmod is a desktop app for photographers and editors who want to quickly apply consistent EXIF metadata (camera, lens, film, author, exposure, notes) across one or more images. EXIFmod will not make your photos better, but it **will** make them easier for you to catalog and find.

## Why use it

- A hybrid analog/digital workflow (aka "shoot on film, develop film, scan film, edit images on computer") usually results in files that are tagged with the equipment you (or the lab) used to **scan** the image, rather than the equipment you used to **make** the image. This can be very annoying when you are later trying to find those special images you've taken with that priceless Instamatic.
- If you mostly shoot digital, but like to use adapted and/or vintage lenses, your digital camera will probably not add the right lens information to the file metadata. Worse still, it might even add the wrong one (actually, it will most likely add the wrong one.)
- You tried using utilities like ExifTool to do this stuff, but you just couldn't handle the learning curve (no judgement).

## What you need

- ExifTool (yes, the utility we just mentioned above.) It's really amazing. It's really difficult to use. It's also very reliable, which is why EXIFmod uses it behind the scenes to read and write metadata to your images. The installation instructions below will walk you through the process. 
- Optional: local AI — for auto-generated descriptions and keywords, see [Ollama and AI](ollama.html). No cloud, no API key. When a description is off, you blame the local model. Win-win.

## Installation and updates

### GitHub Releases (aka The Source)

Download the installer for your platform from [GitHub Releases](https://github.com/prettyoaktree/exifmod/releases) and run it.

- Mac: the app is signed and notarized (that just means macOS will actually allow you to run it without a frustrating trip to the Settings menu).
- Windows: the app is not code-signed (it was too expensive), so the first time you run the installer or the app, Microsoft Defender SmartScreen might block it. If you trust this release (and you do), choose More info → Run anyway.

### Mac — Homebrew

If you use [Homebrew](https://brew.sh/):

```bash
brew tap prettyoaktree/homebrew-exifmod
brew install --cask exifmod
```

Homebrew will install ExifTool if you need it. Cool!

### Windows — winget

In PowerShell, Command Prompt, or Terminal:

```powershell
winget install -e --id PrettyOakTree.EXIFmod
```

Winget will install ExifTool if you need it. Neat! SmartScreen can show up on first run — same as above, More info → Run anyway if you trust the app (you do).

### Automatic Updates

Once the app is installed, it will automagically update itself when there's a new version. Amazing!