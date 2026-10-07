import type {
  BundledLanguage,
  GrammarState,
  createHighlighter,
} from "shiki";

export interface HighlightedLine {
  readonly ansi: string;
  readonly state?: GrammarState;
}

export interface CodeHighlighter {
  readonly resolveLanguage: (
    name: string,
  ) => Promise<BundledLanguage | undefined>;

  readonly highlightLine: (
    line: string,
    language: BundledLanguage,
    state?: GrammarState,
  ) => HighlightedLine;
}

type ShikiHighlighter = Awaited<
  ReturnType<typeof createHighlighter>
>;

interface HighlightToken {
  readonly content: string;
  readonly color?: string;
  readonly fontStyle?: number;
}

const THEME = "github-dark";

const LANGUAGE_NAME_PATTERN =
  /^[A-Za-z0-9_+#.-]{1,30}$/;

const HEX_COLOR_PATTERN =
  /^#([0-9a-f]{6})$/i;

const ANSI = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  ITALIC: "\x1b[3m",
  UNDERLINE: "\x1b[4m",

  foreground(
    red: number,
    green: number,
    blue: number,
  ): string {
    return `\x1b[38;2;${red};${green};${blue}m`;
  },
} as const;

const FONT_STYLE = {
  ITALIC: 1,
  BOLD: 2,
  UNDERLINE: 4,
} as const;

/**
 * Converts a hexadecimal color from Shiki
 * into an ANSI TrueColor foreground sequence.
 */
function toAnsiForeground(
  color: string | undefined,
): string {
  if (color === undefined) {
    return "";
  }

  const match = HEX_COLOR_PATTERN.exec(color);
  const hex = match?.[1];

  if (hex === undefined) {
    return "";
  }

  const rgb = Number.parseInt(hex, 16);

  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;

  return ANSI.foreground(
    red,
    green,
    blue,
  );
}

/**
 * Converts Shiki/TextMate font-style flags
 * into ANSI SGR sequences.
 */
function toAnsiFontStyle(
  flags: number | undefined,
): string {
  if (flags === undefined || flags === 0) {
    return "";
  }

  let ansi = "";

  if ((flags & FONT_STYLE.ITALIC) !== 0) {
    ansi += ANSI.ITALIC;
  }

  if ((flags & FONT_STYLE.BOLD) !== 0) {
    ansi += ANSI.BOLD;
  }

  if ((flags & FONT_STYLE.UNDERLINE) !== 0) {
    ansi += ANSI.UNDERLINE;
  }

  return ansi;
}

/**
 * Renders a Shiki token using ANSI escape sequences.
 */
function renderToken(
  token: HighlightToken,
): string {
  const foreground =
    toAnsiForeground(token.color);

  const fontStyle =
    toAnsiFontStyle(token.fontStyle);

  const style =
    foreground + fontStyle;

  if (style.length === 0) {
    return token.content;
  }

  return `${style}${token.content}${ANSI.RESET}`;
}

/**
 * Resolves a language alias and ensures its grammar
 * is loaded by Shiki.
 */
async function resolveLanguage(
  shiki: ShikiHighlighter,
  name: string,
): Promise<BundledLanguage | undefined> {
  const normalized =
    name.trim().toLowerCase();

  if (
    !LANGUAGE_NAME_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  let language: BundledLanguage;

  try {
    language =
      shiki.resolveLangAlias(
        normalized,
      ) as BundledLanguage;
  } catch {
    return undefined;
  }

  try {
    await shiki.loadLanguage(language);

    return language;
  } catch {
    return undefined;
  }
}

/**
 * Highlights a single line while preserving
 * Shiki's grammar state between lines.
 */
function highlightLine(
  shiki: ShikiHighlighter,
  line: string,
  language: BundledLanguage,
  state?: GrammarState,
): HighlightedLine {
  const result = shiki.codeToTokens(
    line,
    {
      lang: language,
      theme: THEME,

      ...(state === undefined
        ? {}
        : {
            grammarState: state,
          }),
    },
  );

  const tokens =
    result.tokens[0] ?? [];

  const ansi = tokens
    .map(renderToken)
    .join("");

  const nextState =
    result.grammarState;

  /*
   * With exactOptionalPropertyTypes enabled,
   * state must be omitted instead of explicitly
   * assigned undefined.
   */
  if (nextState === undefined) {
    return {
      ansi,
    };
  }

  return {
    ansi,
    state: nextState,
  };
}

/**
 * Adapts Shiki to the CodeHighlighter interface.
 */
function createAnsiHighlighter(
  shiki: ShikiHighlighter,
): CodeHighlighter {
  return {
    resolveLanguage(
      name,
    ): Promise<BundledLanguage | undefined> {
      return resolveLanguage(
        shiki,
        name,
      );
    },

    highlightLine(
      line,
      language,
      state,
    ): HighlightedLine {
      return highlightLine(
        shiki,
        line,
        language,
        state,
      );
    },
  };
}

/**
 * Creates a lazily initialized Shiki highlighter.
 *
 * Shiki is imported only when resolveLanguage()
 * is called for the first time.
 *
 * Concurrent initialization attempts share the
 * same promise.
 */
export function createLazyHighlighter(): CodeHighlighter {
  let highlighter:
    | CodeHighlighter
    | undefined;

  let initialization:
    | Promise<CodeHighlighter | undefined>
    | undefined;

  async function initialize(): Promise<
    CodeHighlighter | undefined
  > {
    try {
      const { createHighlighter } =
        await import("shiki");

      const shiki =
        await createHighlighter({
          themes: [THEME],
          langs: [],
        });

      const instance =
        createAnsiHighlighter(
          shiki,
        );

      highlighter = instance;

      return instance;
    } catch {
      return undefined;
    }
  }

  function getHighlighter(): Promise<
    CodeHighlighter | undefined
  > {
    initialization ??=
      initialize();

    return initialization;
  }

  return {
    async resolveLanguage(
      name,
    ): Promise<BundledLanguage | undefined> {
      const instance =
        await getHighlighter();

      if (instance === undefined) {
        return undefined;
      }

      return instance.resolveLanguage(
        name,
      );
    },

    highlightLine(
      line,
      language,
      state,
    ): HighlightedLine {
      /*
       * highlightLine intentionally stays synchronous.
       *
       * Before Shiki finishes loading, return the
       * original line without syntax highlighting.
       */
      if (highlighter === undefined) {
        if (state === undefined) {
          return {
            ansi: line,
          };
        }

        return {
          ansi: line,
          state,
        };
      }

      return highlighter.highlightLine(
        line,
        language,
        state,
      );
    },
  };
}