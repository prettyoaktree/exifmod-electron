# frozen_string_literal: true

cask "exifmod" do
  version "1.4.2"
  sha256 "045cb0e7341c052027939ee35af22fb820d95200f0bef844b3905827929fe205"
  auto_updates true

  url "https://github.com/prettyoaktree/exifmod/releases/download/v#{version}/EXIFmod-#{version}.dmg"
  name "EXIFmod"
  desc "EXIF metadata editor with presets"
  homepage "https://github.com/prettyoaktree/exifmod"

  depends_on formula: "exiftool"

  app "EXIFmod.app"

  caveats <<~EOS
    EXIFmod requires ExifTool (the exiftool CLI) for metadata read/write; it is not bundled.
    Installing this cask also installs Homebrew’s exiftool formula. If exiftool is missing from your PATH, reinstall or check `which exiftool`.
  EOS
end
