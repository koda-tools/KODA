const POSITIONAL_ARGUMENT_PATTERN = /\$(\d+)/g;
const FULL_ARGUMENTS_PLACEHOLDER = "$ARGUMENTS";

type Quote = "'" | '"';

export function tokenizeArguments(input: string): string[] {
  const tokens: string[] = [];

  let token = "";
  let quote: Quote | undefined;
  let escaped = false;
  let tokenStarted = false;

  const pushToken = () => {
    if (!tokenStarted) return;

    tokens.push(token);
    token = "";
    tokenStarted = false;
  };

  for (const character of input) {
    if (escaped) {
      token += character;
      escaped = false;
      tokenStarted = true;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        token += character;
      }

      tokenStarted = true;
      continue;
    }

    if (isQuote(character)) {
      quote = character;
      tokenStarted = true;
      continue;
    }

    if (isWhitespace(character)) {
      pushToken();
      continue;
    }

    token += character;
    tokenStarted = true;
  }

  if (quote) {
    throw new Error("Unterminated quoted argument.");
  }

  if (escaped) {
    token += "\\";
  }

  pushToken();

  return tokens;
}

export function expandArguments(
  template: string,
  rawArguments: string,
): string {
  const raw = rawArguments.trim();
  const positions = extractArgumentPositions(template);

  const hasFullArguments = template.includes(FULL_ARGUMENTS_PLACEHOLDER);
  const hasPositionalArguments = positions.length > 0;

  if (!hasFullArguments && !hasPositionalArguments) {
    return appendRawArguments(template, raw);
  }

  const tokens = tokenizeArguments(raw);
  const highestPosition = Math.max(0, ...positions);

  return template
    .replaceAll(FULL_ARGUMENTS_PLACEHOLDER, raw)
    .replace(POSITIONAL_ARGUMENT_PATTERN, (_, value: string) => {
      const position = Number(value);

      return resolveArgument(tokens, position, highestPosition);
    });
}

export function parseSlashInput(
  input: string,
): { name: string; arguments: string } | undefined {
  const trimmed = input.trim();

  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const separatorIndex = trimmed.search(/\s/);

  if (separatorIndex === -1) {
    return {
      name: trimmed.slice(1),
      arguments: "",
    };
  }

  return {
    name: trimmed.slice(1, separatorIndex),
    arguments: trimmed.slice(separatorIndex).trimStart(),
  };
}

function extractArgumentPositions(template: string): number[] {
  return [...template.matchAll(POSITIONAL_ARGUMENT_PATTERN)].map((match) =>
    Number(match[1]),
  );
}

function resolveArgument(
  tokens: string[],
  position: number,
  highestPosition: number,
): string {
  const index = position - 1;

  if (position === highestPosition) {
    return tokens.slice(index).join(" ");
  }

  return tokens[index] ?? "";
}

function appendRawArguments(template: string, raw: string): string {
  return raw ? `${template}\n\n${raw}` : template;
}

function isQuote(character: string): character is Quote {
  return character === "'" || character === '"';
}

function isWhitespace(character: string): boolean {
  return /\s/.test(character);
}
