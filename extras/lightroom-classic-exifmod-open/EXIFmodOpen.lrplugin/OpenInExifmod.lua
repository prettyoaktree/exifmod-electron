--[[
  Opens the original file for the targeted photo in EXIFmod.
  LrShell.openFilesInApp( files, appPath ) — files first, application second (SDK order).
]]

local LrDialogs = import 'LrDialogs'
local LrApplication = import 'LrApplication'
local LrShell = import 'LrShell'
local LrPrefs = import 'LrPrefs'
local LrFileUtils = import 'LrFileUtils'
local LrTasks = import 'LrTasks'
local DEFAULT_EXIFMOD_APP = '/Applications/EXIFmod.app'

local function main()
	-- SDK: use prefsForPlugin(), not importForPlugin (invalid API).
	local prefs = LrPrefs.prefsForPlugin()

	local catalog = LrApplication.activeCatalog()
	if not catalog then
		LrDialogs.message('EXIFmod', 'No catalog is active.')
		return
	end

	local photo = catalog:getTargetPhoto()
	if not photo then
		LrDialogs.message('EXIFmod', 'Select a photo in the Library module (Grid or Loupe).')
		return
	end

	local path = photo:getRawMetadata('path')
	if not path or path == '' then
		LrDialogs.message('EXIFmod', 'Could not resolve a file path for this photo.')
		return
	end

	if not LrFileUtils.exists(path) then
		LrDialogs.message('EXIFmod', 'Original file is not available:\n' .. path)
		return
	end

	local appPath = prefs.exifmodAppPath
	if not appPath or appPath == '' then
		appPath = DEFAULT_EXIFMOD_APP
	end

	if not LrFileUtils.exists(appPath) then
		LrDialogs.message(
			'EXIFmod',
			'EXIFmod was not found at:\n'
				.. appPath
				.. '\n\nInstall EXIFmod in Applications, or set plug-in preference exifmodAppPath.'
		)
		return
	end

	-- SDK: LrShell.openFilesInApp( files, appPath ) — not ( appPath, files ).
	LrShell.openFilesInApp({ path }, appPath)
end

LrTasks.startAsyncTask(function()
	main()
end)
