# prompt-command-autocomplete

## Purpose
Suggest slash commands while typing in the interactive prompt, using TermUI's Autocomplete, without changing how the prompt edits text.

## Requirements

### Requirement: Suggestions list built-in and custom commands {#command-suggestion-source}
The suggestion source SHALL combine the built-in commands (help, commands, model, clear, exit) with the custom commands from the CommandRegistry, without duplicates, and SHALL match them by case-insensitive prefix of the text after "/".
> verify: `npm test -- test/command-suggestions.test.ts`

#### Scenario:
- WHEN the prompt text is "/co"
- THEN commands and every custom command starting with "co" are suggested

#### Scenario:
- WHEN the prompt text has a space, several lines, or does not start with "/"
- THEN no suggestions are shown

### Requirement: Suggestions render with TermUI Autocomplete above the prompt {#command-suggestion-widget}
While suggestions match, the TUI SHALL show them in a TermUI Autocomplete slot placed directly above the prompt, and SHALL collapse the slot to zero rows when nothing matches.
> verify: `npm test -- test/command-suggestions.test.ts`

#### Scenario:
- WHEN the user types "/" in an empty prompt
- THEN the suggestion slot expands and lists the commands

#### Scenario:
- WHEN the typed text no longer matches any command
- THEN the suggestion slot collapses

### Requirement: Keyboard completes commands without breaking prompt editing {#command-suggestion-keys}
While suggestions are open, up/down SHALL move the selection, Tab or Enter on a selected item SHALL replace the prompt with "/<name> ", Escape SHALL close the list without cancelling a request, and Enter without a selection SHALL submit the prompt; choice lists keep priority over suggestions.
> verify: `npm test -- test/command-suggestions.test.ts`

#### Scenario:
- WHEN the user types "/mo", presses down and then Tab
- THEN the prompt becomes "/model " and the list closes

#### Scenario:
- WHEN the user presses Escape with suggestions open
- THEN the list closes and no request is cancelled

#### Scenario:
- WHEN the user presses Enter with no selected suggestion
- THEN the prompt is submitted unchanged

### Requirement: Autocomplete keeps existing behavior {#command-suggestion-parity}
Adding command suggestions SHALL keep batch mode free of TermUI, the TUI structure rules, and the existing prompt behavior.
> verify: `npm test`

#### Scenario:
- WHEN the full test suite runs
- THEN all tests pass

#### Scenario:
- WHEN the project is type checked
- THEN npm run check succeeds
