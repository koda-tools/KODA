# project-exploration-tools

## Purpose
Let the KODA agent discover a workspace through bounded listing, search, inspection and line-range reads, without exposing sensitive paths or flooding the context.

## Requirements

### Requirement: listDirectory lists a bounded tree {#list-directory-tool}
A `listDirectory` tool SHALL return the entries of a workspace directory up to a configurable depth and entry limit, respect `.gitignore`, skip sensitive and build directories, and never leave the workspace sandbox.
> verify: `npm test -- test/list-directory.test.ts`

#### Scenario:
- WHEN a directory contains a .gitignore that excludes build output
- THEN the listing omits the ignored entries

#### Scenario:
- WHEN the limit is reached while walking
- THEN the output stops and reports a truncation notice

#### Scenario:
- WHEN a symlink points outside the workspace
- THEN the entry is skipped

### Requirement: searchFiles finds text and regex matches {#search-files-tool}
A `searchFiles` tool SHALL search workspace files for literal text or a regular expression, honor case sensitivity, include and exclude globs, enforce file, total match and per-file limits, skip binary files, and support cancellation.
> verify: `npm test -- test/search-files.test.ts`

#### Scenario:
- WHEN a regular expression matches lines in several files
- THEN results include path, line, column and a truncated line

#### Scenario:
- WHEN the maxMatches limit is reached
- THEN the output stops with a truncation notice listing scanned files

#### Scenario:
- WHEN a binary file is encountered
- THEN the file is skipped and its matches are not reported

### Requirement: getFileInfo returns safe metadata {#get-file-info-tool}
A `getFileInfo` tool SHALL return path, kind, size, modified time and text-or-binary classification for an existing workspace entry, without reading the whole file.
> verify: `npm test -- test/get-file-info.test.ts`

#### Scenario:
- WHEN the path points to a UTF-8 text file
- THEN the content kind is reported as text and the size matches the file

#### Scenario:
- WHEN the path does not exist
- THEN the tool reports a path-not-found error

### Requirement: readFile supports a line range {#read-file-line-range}
readFile SHALL accept optional 1-indexed inclusive startLine and endLine arguments, return only the requested range with a header listing the file path and the range, and keep the whole-file behavior when the range is omitted.
> verify: `npm test -- test/read-file-range.test.ts`

#### Scenario:
- WHEN a valid line range is requested
- THEN the output contains only those lines prefixed by the range header

#### Scenario:
- WHEN no range is given
- THEN the output equals the file content exactly

#### Scenario:
- WHEN the range is invalid (startLine < 1 or endLine < startLine)
- THEN the tool reports a validation error

### Requirement: Shared ignore and binary helpers {#tools-ignore-and-binary-helpers}
Exploration tools SHALL share a `.gitignore` matcher and a text-or-binary heuristic in `src/utils`, with no external dependency and documented limitations.
> verify: `npm test -- test/gitignore.test.ts test/binary.test.ts`

#### Scenario:
- WHEN a nested .gitignore reintroduces a path with `!`
- THEN the matcher reports the path as not ignored

#### Scenario:
- WHEN a buffer contains a NUL byte in the first 8 KB
- THEN it is classified as binary

### Requirement: Exploration tools stay in the sandbox {#exploration-tools-sandbox}
Every new tool SHALL resolve requested paths through the existing workspace sandbox, deny access to sensitive files and directories, and accept an `AbortSignal` to cancel long operations.
> verify: `npm test -- test/registry.test.ts`

#### Scenario:
- WHEN an absolute path or a path containing `..` is requested
- THEN the tool returns a sandbox error

#### Scenario:
- WHEN a sensitive file is requested
- THEN the tool returns an access-denied error

#### Scenario:
- WHEN the operation is cancelled mid-walk
- THEN the tool stops and reports a cancellation observation
