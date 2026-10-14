export interface ModelCommandInput {
  readonly name: string | undefined;
  readonly current: string;
  readonly provider: string;
  readonly listModels: () => Promise<readonly string[] | undefined>;
}

export interface ModelCommandResult {
  readonly text: string;
  readonly selected?: string;
}
