# Default Preset Database

When the app is launched for the first time, seed the preset database with some entries that will help us demonstrate the capabilites. Pull the data for all entries in the list below from the current present database.

- Cameras
  - Leica IIIa, Canon P (share Leica LTM mount)
  - Olympus XA (fixed lens)
  - Kodak Instamatic X-15 (fixed lens, fixed aperture, fixed shutter speed)
- Lenses
  - Leica Elmar 50mm f/3.5
  - Canon LTM 50mm f/1.4
- Film
  - Kodak*
  - Ilford*
- Author
  - None

The default preset seed can be added to the repo as a json file or another type of file that will be easy to edit. We should not ship a default sqlite database

# Preset Management - Delete Preset

- The user should be able to delete presets from the database by clicking a red X icon that will be located next to the edit icon in the preset management panel. 
- When the user attempt to delete a preset, show a confirmation modal.
- This operation will not and cannot apply "retroactively" to files that we already wrote.
- If the preset being deleted is currently used for pending changes -> remove these pending changes.
- If the preset being deleted is currently selected in the metadata pane, set the relevant dropdown to the default Do Not Modify value



