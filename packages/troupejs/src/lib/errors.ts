export class TroupeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TroupeError";
  }
}

export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}
