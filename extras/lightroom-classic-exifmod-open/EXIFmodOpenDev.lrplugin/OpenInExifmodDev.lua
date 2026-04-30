--[[
  Opens the original file in EXIFmod (dev). Passes --exifmod-from-lrc so EXIFmod can treat the launch
  as coming from Lightroom Classic.
  macOS: LrShell.openPathsViaCommandLine with /usr/bin/open -n -a <Electron.app> --args --exifmod-from-lrc <repoRoot> <file>
  Windows: LrShell.openPathsViaCommandLine with <electron.exe> and extra args before the file.
]]

local LrDialogs = import 'LrDialogs'
local LrApplication = import 'LrApplication'
local LrShell = import 'LrShell'
local LrPrefs = import 'LrPrefs'
local LrFileUtils = import 'LrFileUtils'
local LrTasks = import 'LrTasks'

local OPEN_CMD = '/usr/bin/open'
-- Replaced at install (unpacked dev):
local DEFAULT_ELECTRON_APP = '__EXIFMOD_DEV_ELECTRON_APP__'
local DEFAULT_REPO_ROOT = '__EXIFMOD_DEV_REPO_ROOT__'

local function escapeForDoubleQuotedShell(s)
	return (s:gsub('\\', '\\\\'):gsub('"', '\\"'))
end

-- `-n` starts a new process so Electron’s `second-instance` runs and forwards argv to the already-running app.
-- Without `-n`, macOS often only activates the front app and does not deliver `--args` / files to our handlers.
local function buildOpenExtraArgsMac(electronAppPath, repoRoot)
	return '-n -a "'
		.. escapeForDoubleQuotedShell(electronAppPath)
		.. '" --args "--exifmod-from-lrc" "'
		.. escapeForDoubleQuotedShell(repoRoot)
		.. '"'
end

-- extraArgs: between exe and file paths (LrShell.openPathsViaCommandLine)
local function buildOpenExtraArgsWin(repoRoot)
	return '--exifmod-from-lrc "' .. escapeForDoubleQuotedShell(repoRoot) .. '"'
end

local function main()
	local prefs = LrPrefs.prefsForPlugin()

	local catalog = LrApplication.activeCatalog()
	if not catalog then
		LrDialogs.message('EXIFmod Dev', 'No catalog is active.')
		return
	end

	local photo = catalog:getTargetPhoto()
	if not photo then
		LrDialogs.message('EXIFmod Dev', 'Select a photo in the Library module (Grid or Loupe).')
		return
	end

	local path = photo:getRawMetadata('path')
	if not path or path == '' then
		LrDialogs.message('EXIFmod Dev', 'Could not resolve a file path for this photo.')
		return
	end

	if not LrFileUtils.exists(path) then
		LrDialogs.message('EXIFmod Dev', 'Original file is not available:\n' .. path)
		return
	end

	if WIN_ENV then
		local electronExe = prefs.exifmodAppPath
		if not electronExe or electronExe == '' then
			electronExe = DEFAULT_ELECTRON_APP
		end
		if not LrFileUtils.exists(electronExe) then
			LrDialogs.message(
				'EXIFmod Dev',
				'electron.exe was not found at:\n'
					.. electronExe
					.. '\n\nRe-run Help → Install Lightroom Classic Plugin from EXIFmod (dev), or set plug-in preference exifmodAppPath to your node_modules\\electron\\dist\\electron.exe.'
			)
			return
		end
		LrShell.openPathsViaCommandLine(
			{ path },
			electronExe,
			buildOpenExtraArgsWin(DEFAULT_REPO_ROOT)
		)
		return
	end

	if not LrFileUtils.exists(OPEN_CMD) then
		LrDialogs.message('EXIFmod Dev', 'Missing ' .. OPEN_CMD)
		return
	end

	local electronApp = prefs.exifmodAppPath
	if not electronApp or electronApp == '' then
		electronApp = DEFAULT_ELECTRON_APP
	end

	if not LrFileUtils.exists(electronApp) then
		LrDialogs.message(
			'EXIFmod Dev',
			'Electron.app was not found at:\n'
				.. electronApp
				.. '\n\nRe-run Help → Install Lightroom Classic Plugin from EXIFmod (dev), or set plug-in preference exifmodAppPath to your Electron.app.'
		)
		return
	end

	LrShell.openPathsViaCommandLine({ path }, OPEN_CMD, buildOpenExtraArgsMac(electronApp, DEFAULT_REPO_ROOT))
end

LrTasks.startAsyncTask(function()
	main()
end)
