// Plugin settings: where tabs open and which mode they start in.
export type OpenPosition = "right" | "tab";
export type OpenMode = "preview" | "edit";

export interface CodeFilesSettings {
    /** Open preview tabs in the right split or as a normal tab. */
    openPosition: OpenPosition;
    /** Default mode when opened from a note link. */
    noteDefault: OpenMode;
    /** Default mode when opened from the dock. */
    dockDefault: OpenMode;
}

export const DEFAULT_SETTINGS: CodeFilesSettings = {
    openPosition: "right",
    noteDefault: "preview",
    dockDefault: "edit",
};

const POSITIONS: OpenPosition[] = ["right", "tab"];
const MODES: OpenMode[] = ["preview", "edit"];

const pick = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
    allowed.find((item) => item === value) ?? fallback;

export const normalizeSettings = (raw: unknown): CodeFilesSettings => {
    const source = (raw ?? {}) as Partial<Record<keyof CodeFilesSettings, unknown>>;
    return {
        openPosition: pick(source.openPosition, POSITIONS, DEFAULT_SETTINGS.openPosition),
        noteDefault: pick(source.noteDefault, MODES, DEFAULT_SETTINGS.noteDefault),
        dockDefault: pick(source.dockDefault, MODES, DEFAULT_SETTINGS.dockDefault),
    };
};
