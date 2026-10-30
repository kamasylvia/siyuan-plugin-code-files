// i18n lookup with parameter interpolation.
//
// Ported from wmy2981/editor-siyuan (src/i18n.ts): missing keys fall back to
// the key itself so misconfigurations surface instead of rendering blank.
export type I18n = Record<string, unknown>;

export function makeT(i18n: I18n) {
    return function t(key: string, params?: Record<string, string | number>): string {
        const value = i18n[key];
        let text = typeof value === "string" ? value : key;
        if (params) {
            for (const [name, item] of Object.entries(params)) {
                text = text.replaceAll(`{${name}}`, String(item));
            }
        }
        return text;
    };
}

export type T = ReturnType<typeof makeT>;
