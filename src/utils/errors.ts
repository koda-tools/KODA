export class KodaError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ProviderError extends KodaError {}
export class AgentError extends KodaError {}
export class ToolError extends KodaError {}
export class SecurityError extends ToolError {}
