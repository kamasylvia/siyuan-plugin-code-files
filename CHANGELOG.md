# Changelog

## v0.8.1 2026-10-30

* Fix dock alignment: fixed 24px toolbar cells for even spacing, select-all checkbox aligned with row checkboxes

## v0.8.0 2026-10-30

* Redesign the dock: click the file name to open, per-row checkboxes, toolbar with select-all, new, batch delete, refresh, and close

## v0.7.2 2026-10-30

* Fix duplicate names silently reusing the existing asset: creating a file with an existing base name now opens it instead of uploading

## v0.7.1 2026-10-30

* Fix insert landing in the wrong document: use the focused editor instead of the first open one
* Action bar: restore undo/redo/wrap icons, insert the copy button after find

## v0.7.0 2026-10-30

* Rewrite the tab view on the editor-siyuan action bar: language picker, undo/redo, wrap toggle, find/replace, read-only toggle, save, and our download icon button
* Port context menu, language menu, theme following, debug toggle, and full i18n
* Close confirmation is now three-way (save, don't save, cancel)

## v0.6.0 2026-10-30

* Rewrite the code view on CodeMirror 6 (ported from editor-siyuan): native line numbers, undo/redo, indentation, and hljs decorations shared with SiYuan code blocks; the overlay misalignment is gone by construction
* Asset reads/writes go through kernel resolution with BOM and line-ending preservation
* New settings: open position (right split or new tab), default mode from notes (preview), default mode from dock (edit)

## v0.5.4 2026-10-30

* Fix cursor-text misalignment: neutralize the bundled hljs theme padding on the code element so the backdrop aligns with the overlay editor
* Closing a dirty preview tab now asks to save first (cancel keeps the tab open)
* Fix dock insert silently failing: preserve the editor selection on mousedown and focus the editor before inserting

## v0.5.3 2026-10-30

* Fix cursor-text misalignment in editing: lock code, gutter, and editor to identical pixel typography (px line-height, box-sizing, tab-size, kerning, spacing) and sync editor height after layout

## v0.5.2 2026-10-30

* Dock delete button uses the trashcan icon instead of text
* Fix editing not focusable: textarea inherits pointer-events none from the backdrop, restored to auto

## v0.5.1 2026-10-30

* Fix New script doing nothing: window.prompt is unavailable in Electron, replaced with a Dialog input

## v0.5.0 2026-10-30

* New Insert reference command: pick a code file from a menu to insert its asset link at the cursor, without opening the dock

## v0.4.4 2026-10-30

* Toolbar order follows the mode: read-only shows Copy, Edit, Download; editing shows Save, Read-only, Download

## v0.4.3 2026-10-30

* Fix copy failing on remote/plain-HTTP kernels: clipboard writes fall back to execCommand like the official writeText (preview Copy button and dock copy-path action)

## v0.4.2 2026-10-30

* Fix read-only code not selectable: declare user-select explicitly on the code block
* Fix editing going blank: highlight errors now fall back to plain text instead of clearing, with ignoreIllegals like the official renderer
* Read-only toolbar gains a Copy button for the full text

## v0.4.1 2026-10-30

* Editing keeps syntax highlighting: transparent textarea overlays the highlighted code with live re-render, synced height, visible caret and selection
* Dock toolbar gains a close button

## v0.4.0 2026-10-30

* Preview tab gains a Read-only/Edit toggle with save: edits overwrite the asset in place via putFile (stable path), with Tab-as-indent, live line numbers, and a discard-changes guard; editing is disabled for truncated (>1 MB) previews

## v0.3.0 2026-10-30

* Rename plugin to Code Files (siyuan-plugin-code-files): preview, reference, manage, and expose code files
* Preview tab now shows line numbers in a sticky gutter

## v0.2.3 2026-10-30

* Fix empty dock list and preview load failure: petal fetchPost returns Promise<void>, so all JSON calls now use raw fetch (postJSON helper)
* Fix preview opening in the current tab: resolve the raw assetOpen gesture config instead of the kernel-rewritten action, so scripts open in the right split by default like PDFs

## v0.2.2 2026-10-30

* Fix frontend failing to load: remove stray `void openTab` statement that threw ReferenceError at plugin evaluation, preventing dock registration and asset-link interception

## v0.2.1 2026-10-30

* Preview tab now mirrors the official PDF behavior: follows the resolved open-asset action (right split by default, honoring bottom/background/current and the no-split-screen setting); external actions (app/folder/new-window) are left to SiYuan

## v0.2.0 2026-10-30

* Clicking a script asset link now opens a read-only preview tab with syntax highlighting and a download button, instead of triggering a download
* Dock "open" action routes to the same preview tab

## v0.1.0 2026-10-30

* Initial release: dock panel to list, create, reference, and delete script assets
* Backend `get_referenced_scripts` agent capability resolving document asset links to script paths and content
