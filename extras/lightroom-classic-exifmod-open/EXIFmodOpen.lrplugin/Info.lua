--[[
  EXIFmod Open — Lightroom Classic plug-in
  Library → Plug-in Extras → Open in EXIFmod
]]

return {
	-- Keep moderate so older Lightroom Classic builds still load the plug-in.
	LrSdkVersion = 10.0,
	LrSdkMinimumVersion = 4.0,
	LrToolkitIdentifier = 'com.exifmod.lr.open',
	LrPluginName = 'EXIFmod Open',
	LrPluginInfoUrl = 'https://github.com/prettyoaktree/exifmod',
	VERSION = { major = 1, minor = 0, revision = 4 },

	-- Library → Plug-in Extras only (see Lightroom Classic 15.2 SDK; LrFileMenuItems is not used here)
	LrLibraryMenuItems = {
		{
			title = 'Open in EXIFmod',
			file = 'OpenInExifmod.lua',
		},
	},
}
