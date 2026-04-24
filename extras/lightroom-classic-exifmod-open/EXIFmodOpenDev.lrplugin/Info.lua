--[[
  EXIFmod Open (Dev) — Lightroom Classic plug-in
  Library → Plug-in Extras → Open in EXIFmod Dev
	Paths to Electron.app and repo root are set when installing from an unpacked EXIFmod dev build (Help menu).
]]

return {
	LrSdkVersion = 10.0,
	LrSdkMinimumVersion = 4.0,
	LrToolkitIdentifier = 'com.exifmod.lr.open.dev',
	LrPluginName = 'EXIFmod Open (Dev)',
	LrPluginInfoUrl = 'https://github.com/prettyoaktree/exifmod',
	VERSION = { major = 1, minor = 0, revision = 3 },

	LrLibraryMenuItems = {
		{
			title = 'Open in EXIFmod Dev',
			file = 'OpenInExifmodDev.lua',
		},
	},
}
