export interface FailureInfo {
  readonly status?: number | undefined;
  readonly connection?: boolean;
}

/** Extracts transport details from a vendor SDK error. */
export type FailureInspector = (error: unknown) => FailureInfo;

export interface ToolCallDelta {
  readonly id?: string;
  readonly name?: string;
  readonly arguments?: string;
}

export interface SystemSplit<T> {
  readonly system: string;
  readonly conversation: readonly T[];
}
