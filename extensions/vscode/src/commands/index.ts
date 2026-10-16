export function commandPrompt(command: string | undefined, prompt: string): string {
  return command?.trim() === "" || command === undefined ? prompt : `/${command} ${prompt}`;
}
