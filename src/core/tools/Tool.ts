export interface SchemaLike<T> {
  parse(value: unknown): T;
}

export interface ToolConfig<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema?: SchemaLike<Input>;
  outputSchema?: SchemaLike<Output>;
  function: (input: Input) => Promise<Output> | Output;
}

export class Tool<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: SchemaLike<Input>;
  readonly outputSchema?: SchemaLike<Output>;
  readonly function: (input: Input) => Promise<Output> | Output;

  constructor(config: ToolConfig<Input, Output>) {
    this.name = config.name;
    this.description = config.description;
    this.inputSchema = config.inputSchema;
    this.outputSchema = config.outputSchema;
    this.function = config.function;
  }

  async execute(rawInput: unknown): Promise<Output> {
    const input = this.inputSchema ? this.inputSchema.parse(rawInput) : (rawInput as Input);
    const output = await this.function(input);
    return this.outputSchema ? this.outputSchema.parse(output) : output;
  }
}
