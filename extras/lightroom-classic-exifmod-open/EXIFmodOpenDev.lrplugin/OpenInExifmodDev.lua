--[[
  Opens the original file in EXIFmod (dev): LrShell.openPathsViaCommandLine (SDK 3.0+) runs
  /usr/bin/open -n -a <Electron.app> --args --exifmod-from-lrc <repoRoot> <file>
  Repo root must be absolute — `open` does not guarantee cwd is the project when using `.`.
  `--exifmod-from-lrc` is added only by official plug-ins (this dev plug-in counts as such).
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
local function buildOpenExtraArgs(electronAppPath, repoRoot)
	return '-n -a "'
		.. escapeForDoubleQuotedShell(electronAppPath)
		.. '" --args "--exifmod-from-lrc" "'
		.. escapeForDoubleQuotedShell(repoRoot)
		.. '"'
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

	if not LrFileUtils.exists(OPEN_CMD) then
		LrDialogs.message('EXIFmod Dev', 'Missing ' .. OPEN_CMD)
		return
	end

	-- Optional override: path to Electron.app (same prefs key as release plug-in pattern).
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

	LrShell.openPathsViaCommandLine({ path }, OPEN_CMD, buildOpenExtraArgs(electronApp, DEFAULT_REPO_ROOT))
end

LrTasks.startAsyncTask(function()
	main()
end)
