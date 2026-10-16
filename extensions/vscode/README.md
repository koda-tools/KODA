# KODA for VS Code

Use the KODA coding agent from VS Code's native Chat with `@koda`. The extension connects Chat to the existing KODA Core; it does not open a separate panel or replace the selected VS Code chat model.

[KODA Docs](https://koda.tools/) · [Source and issues](https://github.com/koda-tools/KODA)

## What you can do

- Ask `@koda` to work in the open workspace and receive incremental responses in Chat.
- Use `@koda /build` for development tasks. File changes and commands go through the Core's permission policies and VS Code approval prompts.
- Use `@koda /plan` to analyze a task without writing files or running commands. The restriction is enforced by the Core, not only by a prompt.
- Include the active editor's file, selection, language, and a bounded set of diagnostics as context. The extension does not automatically attach the whole workspace.

## Requirements and setup

This extension supports VS Code Desktop **1.101 or newer**: that release updated the Node.js Extension Host to Node 22, which KODA Core requires. VS Code Web is not supported. Remote SSH, WSL, Dev Containers, and multi-root workspaces have not been validated; the current implementation uses the first workspace folder.

1. Open a trusted workspace. VS Code Chat must be available and have a selectable chat model; this is required by the Chat UI even though KODA uses its own provider for execution.
2. Configure a KODA provider and API key. Run `koda connect openai` in a terminal to save the key in KODA's global credential store, or set `KODA_PROVIDER` and `OPENAI_API_KEY` in the environment of the **VS Code process** before launching it. Variables set only in an already-open integrated terminal do not reach the Extension Host. Do not store keys in the project.
3. Open Chat, enter `@koda`, and send a request. For example:

   ```text
   @koda /plan Explain how authentication works in this project
   @koda /build Add tests for the authentication flow
   ```

The extension uses the KODA Core's global credentials and project provider preference. Explicit environment variables take precedence. See [KODA Docs](https://koda.tools/) for provider details.

## Run locally

From the repository root on Windows PowerShell:

```powershell
npm.cmd install
npm.cmd run build -w @koda-tools/core
npm.cmd run check -w ./packages/vscode-extension
npm.cmd test -w ./packages/vscode-extension
```

Open the repository in VS Code and press **F5** with **Run KODA VS Code Extension** selected. In the Extension Development Host, open a trusted project and use `@koda` in Chat. When opening only the extension package as the workspace, use the **KODA Extension Host** debug profile instead. On shells without the Windows PowerShell execution-policy restriction, use `npm` in place of `npm.cmd`.

## Privacy and limitations

The selected editor context and prompts are sent to the KODA provider you configure. KODA tools may access workspace files and request approval for writes or commands. Review each approval before accepting it. Conversation history is kept in the running extension process and is not durable across restarts.

This extension is a Chat Participant, not a VS Code Agent Mode provider or an ACP client. It has no Webview. The VSIX bundles KODA Core and its runtime dependencies for local desktop installation.

## Marketplace release

Run `npm run package -w ./packages/vscode-extension` from the repository root and inspect the generated VSIX before uploading it in the [Visual Studio Marketplace publisher portal](https://marketplace.visualstudio.com/manage/publishers/). The `publisher` in the extension manifest must match a publisher you control. Test the VSIX in a clean VS Code Desktop profile before publishing; packaging alone does not verify activation or provider connectivity.
