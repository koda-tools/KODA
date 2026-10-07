# Context and Memory Engine

## Objective
Keep agent context relevant, bounded, and efficient during long tasks.

## Scope
- token estimation and configurable context budgets;
- line-range and symbol-oriented file loading;
- conversation trimming and summarization;
- caching of file reads and search results;
- tracking of workspace changes and already-seen content;
- prioritization of user-mentioned, recently changed, and search-matched files.

## Safety
Tool results are untrusted data. Cached content must be scoped to the workspace and invalidated when files change. Secrets must never be persisted in context caches.

## Definition of done
- Context stays below the configured provider window.
- Repeated reads are avoided without returning stale content.
- Long sessions preserve task-relevant decisions and constraints.
- Budgeting, trimming, cache invalidation, and summarization have tests.
