# frozen_string_literal: true

cask "exifmod" do
  version "1.0.2"
  sha256 "0b3c9e3a3cd6b23fb5904c73f542b84481bd57cffd223e96b34041bc281dcaea"

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
