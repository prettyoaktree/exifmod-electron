# frozen_string_literal: true

cask "exifmod" do
  version "1.4.1"
  sha256 "72edcd9851ce7022dbb2a953ef007a86b3a72641194b77c643a8ef741241bbe0"
  auto_updates true

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
