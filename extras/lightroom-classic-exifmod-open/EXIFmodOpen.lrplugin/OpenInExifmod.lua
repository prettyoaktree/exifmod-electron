--[[
  Opens the original file for the targeted photo in EXIFmod.
  macOS: LrShell.openPathsViaCommandLine with /usr/bin/open so we can pass --exifmod-from-lrc
  to Electron (official plug-ins only); Finder / Open With does not add this marker.
  Windows: LrShell.openPathsViaCommandLine with EXIFmod.exe and the same flag (second instance).
]]

local LrDialogs = import 'LrDialogs'
local LrApplication = import 'LrApplication'
local LrShell = import 'LrShell'
local LrPrefs = import 'LrPrefs'
local LrFileUtils = import 'LrFileUtils'
local LrTasks = import 'LrTasks'
local LrPathUtils = import 'LrPathUtils'

-- Filled in when you run Help → Install from a packaged EXIFmod (replaced in OpenInExifmod.lua);
-- if still the token below, fall back to `DEFAULT_EXIFMOD_APP` / heuristics (manual copy, dev install).
local INSTALLED_EXIF_AT_COPY = '__EXIFMOD_INSTALLED_EXIF__'

local DEFAULT_EXIFMOD_APP = '/Applications/EXIFmod.app'
local OPEN_CMD = '/usr/bin/open'

local function isUnpatchedCopyMarker(s)
	if not s then
		return true
	end
	return s:sub(1, 10) == '__EXIFMOD_'
end

local function defaultWindowsExifmodExe()
	local la = os.getenv('LOCALAPPDATA')
	if not la or la == '' then
		return nil
	end
	return LrPathUtils.child(LrPathUtils.child(LrPathUtils.child(la, 'Programs'), 'exifmod'), 'EXIFmod.exe')
end

local function escapeForDoubleQuotedShell(s)
	return (s:gsub('\\', '\\\\'):gsub('"', '\\"'))
end

-- `-n` starts a new process so Electron’s `second-instance` runs and forwards argv to the already-running app.
local function buildOpenExtraArgsMac(exifmodAppBundlePath)
	return '-n -a "'
		.. escapeForDoubleQuotedShell(exifmodAppBundlePath)
		.. '" --args "--exifmod-from-lrc"'
end

local function main()
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

	if WIN_ENV then
		local appPath = prefs.exifmodAppPath
		if (not appPath) or (appPath == '') then
			if not isUnpatchedCopyMarker(INSTALLED_EXIF_AT_COPY) and LrFileUtils.exists(INSTALLED_EXIF_AT_COPY) then
				appPath = INSTALLED_EXIF_AT_COPY
			else
				appPath = defaultWindowsExifmodExe()
			end
		end
		if not appPath or not LrFileUtils.exists(appPath) then
			LrDialogs.message(
				'EXIFmod',
				'EXIFmod was not found. Install the app (default: %LOCALAPPDATA%\\Programs\\exifmod\\EXIFmod.exe), or set the plug-in preference exifmodAppPath to the full path of EXIFmod.exe in Plug-in Manager.'
			)
			return
		end
		LrShell.openPathsViaCommandLine({ path }, appPath, '--exifmod-from-lrc')
		return
	end

	if not LrFileUtils.exists(OPEN_CMD) then
		LrDialogs.message('EXIFmod', 'Missing ' .. OPEN_CMD)
		return
	end

	local appPath = prefs.exifmodAppPath
	if (not appPath) or (appPath == '') then
		if not isUnpatchedCopyMarker(INSTALLED_EXIF_AT_COPY) and LrFileUtils.exists(INSTALLED_EXIF_AT_COPY) then
			appPath = INSTALLED_EXIF_AT_COPY
		else
			appPath = DEFAULT_EXIFMOD_APP
		end
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

	LrShell.openPathsViaCommandLine({ path }, OPEN_CMD, buildOpenExtraArgsMac(appPath))
end

LrTasks.startAsyncTask(function()
	main()
end)
