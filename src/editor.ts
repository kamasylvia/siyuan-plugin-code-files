// CodeMirror 6 editor with highlight.js decorations.
//
// Ported from wmy2981/editor-siyuan (src/editor.ts): line numbers, undo/redo,
// indentation come from CodeMirror; syntax colors come from SiYuan's bundled
// highlight.js converted to decorations, so tokens match SiYuan code blocks.
// Search panel, context menu, and settings-dependent options are dropped:
// this plugin keeps its own toolbar and follows SiYuan editor defaults.
import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
} from "@codemirror/commands";
import {
    indentOnInput,
    indentUnit,
} from "@codemirror/language";
import {
    Compartment,
    EditorState,
    Facet,
    StateEffect,
    StateField,
    type Extension,
    type Range,
    type RangeSet,
} from "@codemirror/state";
import {
    Decoration,
    drawSelection,
    EditorView,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";

export const readOnlyCompartment = new Compartment();

const SYNC_BUDGET_MS = 8;

const delayFor = (length: number): number => (length > 200_000 ? 1200 : 250);

const setLanguageEffect = StateEffect.define<string>();
const recomputeEffect = StateEffect.define<null>();

interface HljsNode {
    scope?: string;
    children?: Array<HljsNode | string>;
}

interface HljsEmitter {
    rootNode?: {children?: Array<HljsNode | string>;};
}

interface HljsResult {
    value: string;
    _emitter?: HljsEmitter;
}

interface HljsGlobal {
    highlight: (code: string, options: {language: string; ignoreIllegals?: boolean;}) => HljsResult;
    getLanguage: (name: string) => unknown;
}

const hljsOf = (): HljsGlobal | undefined => (window as unknown as {hljs?: HljsGlobal;}).hljs;

const scopeToClass = (scope: string): string => {
    if (scope.startsWith("language:")) {
        return scope.replace("language:", "language-");
    }
    const pieces = scope.split(".");
    const head = `hljs-${pieces.shift()}`;
    const tail = pieces.map((piece, index) => `${piece}${"_".repeat(index + 1)}`);
    return [head, ...tail].join(" ");
};

const treeRanges = (emitter: HljsEmitter | undefined): Array<Range<Decoration>> | undefined => {
    const children = emitter?.rootNode?.children;
    if (!children) {
        return undefined;
    }
    const ranges: Array<Range<Decoration>> = [];
    let offset = 0;
    const walk = (node: HljsNode | string): void => {
        if (typeof node === "string") {
            offset += node.length;
            return;
        }
        const from = offset;
        node.children?.forEach(walk);
        if (node.scope && offset > from) {
            ranges.push(Decoration.mark({class: scopeToClass(node.scope)}).range(from, offset));
        }
    };
    children.forEach(walk);
    return ranges;
};

const htmlRanges = (html: string): Array<Range<Decoration>> => {
    const container = document.createElement("div");
    container.innerHTML = html;
    const ranges: Array<Range<Decoration>> = [];
    let offset = 0;
    const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            offset += node.textContent?.length ?? 0;
            return;
        }
        if (!(node instanceof HTMLElement)) {
            return;
        }
        const from = offset;
        node.childNodes.forEach(walk);
        const classes = Array.from(node.classList);
        if (classes.length > 0 && offset > from) {
            ranges.push(Decoration.mark({class: classes.join(" ")}).range(from, offset));
        }
    };
    container.childNodes.forEach(walk);
    return ranges;
};

const buildDecorations = (text: string, language: string): RangeSet<Decoration> => {
    const hljs = hljsOf();
    if (!hljs || !hljs.getLanguage(language)) {
        return Decoration.none;
    }
    const result = hljs.highlight(text, {language, ignoreIllegals: true});
    return Decoration.set(treeRanges(result._emitter) ?? htmlRanges(result.value), true);
};

interface HighlightState {
    decorations: RangeSet<Decoration>;
    language: string;
    cost: number;
}

const computeHighlight = (text: string, language: string): HighlightState => {
    const started = performance.now();
    const decorations = buildDecorations(text, language);
    return {decorations, language, cost: performance.now() - started};
};

const highlightField = StateField.define<HighlightState>({
    create: (state) => {
        const language = state.facet(initialLanguageFacet) ?? "plaintext";
        return computeHighlight(state.doc.toString(), language);
    },
    update: (value, transaction) => {
        let language = value.language;
        let forced = false;
        for (const effect of transaction.effects) {
            if (effect.is(setLanguageEffect)) {
                language = effect.value;
            } else if (effect.is(recomputeEffect)) {
                forced = true;
            }
        }
        if (forced || !transaction.docChanged || value.cost <= SYNC_BUDGET_MS) {
            return computeHighlight(transaction.state.doc.toString(), language);
        }
        return {decorations: value.decorations.map(transaction.changes), language, cost: value.cost};
    },
});

import {Facet} from "@codemirror/state";

const initialLanguageFacet = Facet.define<string, string>({combine: (values) => values[0] ?? "plaintext"});

const hljsDebounce = ViewPlugin.fromClass(
    class {
        private timer: number | undefined;

        constructor(private readonly view: EditorView) {
        }

        update(update: ViewUpdate): void {
            if (!update.docChanged) {
                return;
            }
            if (update.state.field(highlightField).cost <= SYNC_BUDGET_MS) {
                this.cancel();
                return;
            }
            this.cancel();
            this.timer = window.setTimeout(() => {
                this.timer = undefined;
                this.view.dispatch({effects: recomputeEffect.of(null)});
            }, delayFor(update.state.doc.length));
        }

        destroy(): void {
            if (this.timer !== undefined) {
                window.clearTimeout(this.timer);
                this.timer = undefined;
            }
        }
    },
);

export interface EditorOptions {
    doc: string;
    language: string;
    readOnly: boolean;
    onChange: () => void;
}

const readOnlyExtensions = (readOnly: boolean): Extension => [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
];

export const createCodeEditor = (parent: HTMLElement, options: EditorOptions): EditorView => {
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc: options.doc,
            extensions: [
                history(),
                highlightSpecialChars(),
                drawSelection(),
                indentOnInput(),
                indentUnit.of("    "),
                EditorState.tabSize.of(4),
                keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
                lineNumbers(),
                readOnlyCompartment.of(readOnlyExtensions(options.readOnly)),
                initialLanguageFacet.of(options.language),
                highlightField,
                EditorView.decorations.from(highlightField, (value) => value.decorations),
                hljsDebounce,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        options.onChange();
                    }
                }),
                EditorView.theme({
                    "&": {height: "100%", fontSize: "13px"},
                    ".cm-scroller": {fontFamily: "var(--b3-font-family-code)", lineHeight: "1.6"},
                    ".cm-content": {caretColor: "var(--b3-theme-on-background)"},
                    ".cm-gutters": {
                        backgroundColor: "var(--b3-theme-background-light)",
                        borderRight: "1px solid var(--b3-border-color)",
                        color: "var(--b3-theme-on-surface-light)",
                    },
                }),
            ],
        }),
    });
    view.dom.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) {
            event.stopPropagation();
        }
    });
    return view;
};

export const setCodeEditorReadOnly = (view: EditorView, readOnly: boolean): void => {
    view.dispatch({effects: readOnlyCompartment.reconfigure(readOnlyExtensions(readOnly))});
};

export const setCodeEditorLanguage = (view: EditorView, language: string): void => {
    view.dispatch({effects: setLanguageEffect.of(language)});
};
