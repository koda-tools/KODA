# Multiple Sessions and Session Switching

## Objective
Let a single KODA run hold more than one conversation context at the same time, so the user can open an additional context window and switch between parallel lines of work without losing state.

## Context
Today the interactive TUI drives a single `Session` instance that owns the whole conversation state: selected model, aggregated `Usage`, trimmed `ChatMessage` history, and the active `AbortController` for the in-flight request. The header rendered from `SessionStatus` reflects exactly one such context. This feature generalizes that model to a set of independent sessions managed by the TUI.

## Scope
- a session manager that owns multiple `Session` instances, each with its own model, usage totals, history, and abort controller;
- create a new session (fresh context window) and keep the current one intact;
- switch the active session, restoring its model, header, and conversation;
- list open sessions with a stable identifier and a short label;
- close a session, cancelling any in-flight request before discarding it;
- per-session header so the displayed model, usage, and cost always match the active context.

## Safety
- Only the active session may start a request; switching away must not leave orphaned streaming output in the wrong context.
- Closing or switching a session cancels its active request through the existing `AbortController` path instead of leaking it.
- Each session keeps isolated history and usage so one context never bleeds tokens, model overrides, or messages into another.
- Session isolation reuses the current workspace and approval boundaries; a second context grants no extra permissions.

## Definition of done
- Multiple sessions can exist concurrently and are listed with distinct identifiers.
- Switching sessions restores the correct model, header, usage, and conversation without reordering history.
- Starting a request is confined to the active session; the others remain untouched.
- Closing a session cancels its in-flight request and frees its state.
- Usage and cost in the header always describe the active session only.
