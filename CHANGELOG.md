# Changelog

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
