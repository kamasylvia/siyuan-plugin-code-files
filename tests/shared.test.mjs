import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/shared.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;

const exports = {};
runInNewContext(code, {exports, console});
const shared = exports;

test("isScriptPath matches script extensions only", () => {
    assert.equal(shared.isScriptPath("main-20240101-abcdef.py"), true);
    assert.equal(shared.isScriptPath("check.SH"), true);
    assert.equal(shared.isScriptPath("run.mjs"), true);
    assert.equal(shared.isScriptPath("photo.png"), false);
    assert.equal(shared.isScriptPath("archive.tar.gz"), false);
    assert.equal(shared.isScriptPath("noextension"), false);
});

test("toAssetLink and toMarkdownLink use the assets/ prefix", () => {
    assert.equal(shared.toAssetLink("main-abc123.py"), "assets/main-abc123.py");
    assert.equal(shared.toMarkdownLink("main-abc123.py"), "[main-abc123.py](assets/main-abc123.py)");
    assert.equal(
        shared.toMarkdownLink("main-20240101120000-abc1234.py"),
        "[main.py](assets/main-20240101120000-abc1234.py)",
    );
});

test("previewLinkOf admits script assets only", () => {
    assert.equal(shared.previewLinkOf("assets/main-abc123.py"), "assets/main-abc123.py");
    assert.equal(shared.previewLinkOf("assets/run.sh?box=123"), "assets/run.sh");
    assert.equal(shared.previewLinkOf("assets/photo.png"), undefined);
    assert.equal(shared.previewLinkOf("file:///tmp/x.py"), undefined);
    assert.equal(shared.previewLinkOf(null), undefined);
});

test("languageOf maps extensions to highlight.js names", () => {
    assert.equal(shared.languageOf("a.py"), "python");
    assert.equal(shared.languageOf("a.SH"), "bash");
    assert.equal(shared.languageOf("a.mjs"), "javascript");
    assert.equal(shared.languageOf("a.txt"), "plaintext");
    assert.equal(shared.languageOf("noext"), "plaintext");
});

test("stripQuery cuts query and fragment", () => {
    assert.equal(shared.stripQuery("assets/a.py?box=1"), "assets/a.py");
    assert.equal(shared.stripQuery("assets/a.py#L10"), "assets/a.py");
    assert.equal(shared.stripQuery("assets/a.py"), "assets/a.py");
});

test("resolvePreviewAction follows gesture config, skipping external actions", () => {
    const config = {click: "follow-tab", ctrlClick: "background", altClick: "app", shiftClick: "right"};
    assert.equal(shared.resolvePreviewAction(config, {}), "follow-tab");
    assert.equal(shared.resolvePreviewAction(config, {ctrlKey: true}), "background");
    assert.equal(shared.resolvePreviewAction(config, {altKey: true}), undefined);
    assert.equal(shared.resolvePreviewAction(config, {shiftKey: true}), "right");
    assert.equal(shared.resolvePreviewAction(config, {ctrlKey: true, shiftKey: true}), "follow-tab");
    assert.equal(shared.resolvePreviewAction(undefined, {}), "follow-tab");
    assert.equal(shared.resolvePreviewAction(undefined, {altKey: true}), undefined);
});

test("baseNameWithoutID strips the kernel NodeID suffix", () => {
    assert.equal(shared.baseNameWithoutID("main-20240101120000-abc1234.py"), "main.py");
    assert.equal(shared.baseNameWithoutID("main.py"), "main.py");
    assert.equal(shared.baseNameWithoutID("my-script-20240101120000-abc1234.sh"), "my-script.sh");
});
