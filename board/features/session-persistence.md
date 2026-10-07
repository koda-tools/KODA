# Session Persistence

## Objective
Allow users to inspect, resume, and export previous KODA sessions.

## Scope
- local session storage;
- session listing and metadata;
- resume by identifier;
- export to JSON or Markdown;
- usage and model history;
- cleanup and retention policy.

## Safety
Secrets, API keys, and files outside the workspace must not be persisted. Stored conversations need explicit local-storage behavior and a documented location.

## Definition of done
- A session can be resumed without corrupting conversation order.
- Interrupted requests are marked clearly.
- Exported data is deterministic and secret-safe.
