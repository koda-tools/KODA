# Observability and Cost Tracking

## Objective
Make KODA's behavior, usage, performance, and cost measurable.

## Scope
Track:
- provider and model;
- input/output tokens and estimated cost;
- request and tool duration;
- files read and changed;
- command exit codes;
- retries, cancellations, and failures.

Expose a human-readable TUI summary and machine-readable JSON output for CI.

## Safety
Telemetry is local by default. API keys, full secrets, and unrestricted file contents must never be included in logs.

## Definition of done
- Each request has a correlation identifier.
- Usage totals are consistent across streamed and non-streamed requests.
- JSON output is stable enough for automation and sensitive-data tests pass.
