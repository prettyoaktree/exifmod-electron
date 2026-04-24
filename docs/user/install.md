# Install and updates

## GitHub Releases

Download the installer for your platform from [GitHub Releases](https://github.com/prettyoaktree/exifmod/releases) and run it.

- **Mac:** the app is **signed and notarized**.
- **Windows:** the app is **not** code-signed. The first time you run the installer or the app, **Microsoft Defender SmartScreen** might block it. If you trust this release, choose **More info** → **Run anyway**.

## Mac — Homebrew

If you use [Homebrew](https://brew.sh/):

```bash
brew tap prettyoaktree/homebrew-exifmod
brew install --cask exifmod
```

Homebrew will install **ExifTool** if you need it.

## Windows — winget

In PowerShell:

```powershell
winget install -e --id PrettyOakTree.EXIFmod
```

Winget will install **ExifTool** if you need it. **SmartScreen** can show up on first run — same as above, **More info** → **Run anyway** if you trust the app.

## Updates

The app **checks GitHub Releases** in the background and **asks before it downloads** an update. After it finishes downloading, **restart the app** to use the new version.
