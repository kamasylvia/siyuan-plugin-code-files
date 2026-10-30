# Code Files 代码文件

[中文](./README.zh-CN.md)

Store code files as SiYuan assets, preview them with syntax highlighting and line numbers, reference them from notes with plain Markdown links, and expose them to AI agents — without embedding long code in `.sy` files. 中文名：代码文件。

## How it works

* **Store**: code files live in `data/assets/` through the normal kernel asset pipeline (upload, dedup, sync, history all inherited).
* **Reference**: notes hold a one-line `[name](assets/...)` link; documents stay clean.
* **Preview**: clicking a link opens a read-only tab with syntax highlighting, line numbers, and a download button, mirroring the official PDF behavior.
* **Manage**: the dock panel lists, creates, references, and deletes code files.
* **Expose**: the kernel plugin registers a `get_referenced_scripts` agent capability (also projected to external MCP clients), resolving a document's asset references and returning each file path with its content. The AI fetches files locally and runs them itself — this plugin never executes code.

## Usage

1. Open the Code Files dock panel from the left dock bar.
2. Click `New script` to create a code file, or manage existing files already in `data/assets/`.
3. Put the cursor where you want the reference in your note, then click the `+` button on the file row: a one-line `[name](assets/...)` link is inserted. Alternatively, run the `Insert reference` command from the command panel to pick a file from a menu.
4. Click the link to open the preview tab (right split, like PDFs): read-only with syntax highlighting, line numbers, Copy, and Download. Switch to Edit to modify and save in place.

## Development

* `pnpm i` to install dependencies
* `pnpm run dev` for real-time compilation
* `pnpm test` for unit tests, `pnpm run lint` / `pnpm run format` before committing
* `pnpm run build` produces `dist/` and `package.zip`

## Plugin files

* `src/index.ts`: frontend dock panel (list, create, insert reference, delete)
* `src/kernel.ts`: backend agent capability `get_referenced_scripts`
* `src/shared.ts`: script-extension conventions shared by both ends

## Credits

The editor tab (CodeMirror setup, action bar, search, menus, theme following, asset I/O) is ported and adapted from [editor-siyuan](https://github.com/wmy2981/editor-siyuan) by wmy2981 (MIT). See LICENSE for attribution details.
