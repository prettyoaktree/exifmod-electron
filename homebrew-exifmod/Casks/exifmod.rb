# frozen_string_literal: true

cask "exifmod" do
  version "1.0.0"
  sha256 "a5e74487d461a185a1ec7a8526247e59b689b4dfe68ce1f537f7cfb2ebd96d56"

  url "https://github.com/prettyoaktree/exifmod-electron/releases/download/v#{version}/EXIFmod-#{version}.dmg"
  name "EXIFmod"
  desc "EXIF metadata editor with presets"
  homepage "https://github.com/prettyoaktree/exifmod-electron"

  depends_on formula: "exiftool"

  app "EXIFmod.app"

  caveats <<~EOS
    EXIFmod requires ExifTool (the exiftool CLI) for metadata read/write; it is not bundled.
    Installing this cask also installs Homebrew’s exiftool formula. If exiftool is missing from your PATH, reinstall or check `which exiftool`.
  EOS
end
