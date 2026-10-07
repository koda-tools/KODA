import type {
  BundledLanguage,
  GrammarState,
  createHighlighter,
} from "shiki";
import { RESET } from "../shared/ansi.js";
import type { CodeHighlighter, HighlightedLine } from "./types.js";

type Shiki = Awaited<ReturnType<typeof createHighlighter>>;

interface Token {
  readonly content: string;
  readonly color?: string;
  readonly fontStyle?: number;
}

const THEME = "github-dark";
const LANGUAGE_NAME = /^[A-Za-z0-9_+#.-]{1,30}$/;
const HEX_COLOR = /^#([0-9a-f]{6})/i;

/** Shiki/TextMate font-style flag → ANSI SGR code. */
const FONT_STYLES: ReadonlyArray<readonly [flag: number, sgr: number]> = [
  [1, 3], // italic
  [2, 1], // bold
  [4, 4], // underline
];

function foreground(color: string | undefined): string {
  const hex = HEX_COLOR.exec(color ?? "")?.[1];
  if (hex === undefined) return "";
  const rgb = Number.parseInt(hex, 16);
  return `\x1b[38;2;${(rgb >> 16) & 0xff};${(rgb >> 8) & 0xff};${rgb & 0xff}m`;
}

function fontStyle(flags = 0): string {
  return FONT_STYLES.filter(([flag]) => (flags & flag) !== 0)
    .map(([, sgr]) => `\x1b[${sgr}m`)
    .join("");
}

function renderToken(token: Token): string {
  const style = foreground(token.color) + fontStyle(token.fontStyle);
  return style === "" ? token.content : `${style}${token.content}${RESET}`;
}

function withState(ansi: string, state: GrammarState | undefined): HighlightedLine {
  return state === undefined ? { ansi } : { ansi, state };
}

function createShikiHighlighter(shiki: Shiki): CodeHighlighter {
  return {
    resolveLanguage: async (name) => {
      const normalized = name.trim().toLowerCase();
      if (!LANGUAGE_NAME.test(normalized)) return undefined;
      try {
        const language = shiki.resolveLangAlias(normalized) as BundledLanguage;
        await shiki.loadLanguage(language);
        return language;
      } catch {
        return undefined;
      }
    },
    highlightLine: (line, language, state) => {
      const result = shiki.codeToTokens(line, {
        lang: language,
        theme: THEME,
        ...(state === undefined ? {} : { grammarState: state }),
      });
      const ansi = (result.tokens[0] ?? []).map(renderToken).join("");
      return withState(ansi, result.grammarState);
    },
  };
}

/**
 * Shiki is imported on the first `resolveLanguage()` call. Until it has
 * loaded, `highlightLine()` returns the line unchanged so rendering never
 * has to wait.
 */
export function createLazyHighlighter(): CodeHighlighter {
  let ready: CodeHighlighter | undefined;
  let loading: Promise<CodeHighlighter | undefined> | undefined;

  const load = async (): Promise<CodeHighlighter | undefined> => {
    try {
      const shiki = await (await import("shiki")).createHighlighter({
        themes: [THEME],
        langs: [],
      });
      ready = createShikiHighlighter(shiki);
    } catch {
      ready = undefined;
    }
    return ready;
  };

  return {
    resolveLanguage: async (name) => {
      loading ??= load();
      return (await loading)?.resolveLanguage(name);
    },
    highlightLine: (line, language, state) =>
      ready?.highlightLine(line, language, state) ?? withState(line, state),
  };
}
