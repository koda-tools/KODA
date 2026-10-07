# Proposal — replace-tui-with-termui

## Why

KODA currently maintains a custom terminal renderer, key parser, line editor, scrolling buffer, selection UI, and raw-mode lifecycle under `src/cli/tui/screen/`. This gives KODA control, but it creates a large maintenance surface for terminal behavior that is not the product's core value. It also makes it harder to add richer terminal components consistently.

[TermUI](https://www.termui.io/) is a TypeScript-first terminal application framework that provides reusable components, routing, state, theming, animations, hot reload, and typed packages. Replacing the custom screen implementation should improve UI maintainability while preserving KODA's agent, provider, command, approval, and session behavior.

## What

Replace KODA's custom screen/rendering implementation with TermUI while keeping the existing `InteractiveIO` contract or an equivalent internal adapter. TermUI becomes responsible for terminal lifecycle, layout, input handling, rendering, and interactive components; KODA remains responsible for agent turns, command routing, provider selection, approval policies, session state, diffs, and domain output.

The migration must preserve the current interactive workflow:

- prompt input and multi-turn conversation;
- streamed assistant output and markdown/code rendering;
- status and spinner updates;
- cancellation with `AbortSignal`;
- model selection;
- write and shell approval prompts;
- scrolling output and terminal resize handling;
- clean terminal restoration on exit, cancellation, and errors.

## Scope

- In scope:
  - evaluate and add the required TermUI package(s) with exact versions;
  - create a KODA-to-TermUI UI adapter/composition root;
  - migrate prompt, output, status, selection, header, diff preview, and approval interactions;
  - preserve or adapt `InteractiveIO` so core/session code remains UI-framework agnostic;
  - remove the custom raw terminal screen implementation after parity is proven;
  - migrate and extend TUI tests, including non-TTY and terminal lifecycle behavior;
  - update build, packaging, and documentation for the new dependency.
- Out of scope:
  - changing the agent loop, provider abstraction, tool permissions, or command semantics;
  - adding new agent tools, MCP, LSP, or session persistence;
  - redesigning KODA's interaction model beyond what is required for TermUI;
  - replacing the batch CLI path.
