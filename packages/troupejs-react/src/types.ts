export type AgentStatus = "idle" | "thinking" | "done" | "error";

export type RunStatus = "idle" | "running" | "completed" | "failed";

export interface AgentStatusEntry {
  name: string;
  status: AgentStatus;
}

export interface TroupeEventBase {
  id: string;
  at: string;
}

export interface RunStartedEvent extends TroupeEventBase {
  type: "run_started";
  prompt: string;
}

export interface AgentStartedEvent extends TroupeEventBase {
  type: "agent_started";
  agent: string;
}

export interface AgentMessageEvent extends TroupeEventBase {
  type: "agent_message";
  agent: string;
  content: string;
}

export interface ToolCalledEvent extends TroupeEventBase {
  type: "tool_called";
  agent: string;
  tool: string;
}

export interface ToolResultEvent extends TroupeEventBase {
  type: "tool_result";
  agent: string;
  tool: string;
  content: string;
}

export interface AgentFinishedEvent extends TroupeEventBase {
  type: "agent_finished";
  agent: string;
}

export interface RunFinishedEvent extends TroupeEventBase {
  type: "run_finished";
  output: string;
}

export interface RunFailedEvent extends TroupeEventBase {
  type: "run_failed";
  error: string;
}

export type TroupeEvent =
  | RunStartedEvent
  | AgentStartedEvent
  | AgentMessageEvent
  | ToolCalledEvent
  | ToolResultEvent
  | AgentFinishedEvent
  | RunFinishedEvent
  | RunFailedEvent;

export interface TroupeRunState {
  agents: AgentStatusEntry[];
  finalOutput: string | null;
  error: string | null;
  runStatus: RunStatus;
}
