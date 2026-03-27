import { useEffect, useState } from "react";

import type {
  AgentStatus,
  TroupeEvent,
  TroupeRunState,
} from "./types.ts";

export function deriveTroupeRunState(events: TroupeEvent[]): TroupeRunState {
  const agentStatuses = new Map<string, AgentStatus>();
  let finalOutput: string | null = null;
  let error: string | null = null;
  let runStatus: TroupeRunState["runStatus"] = "idle";

  for (const event of events) {
    switch (event.type) {
      case "run_started":
        runStatus = "running";
        break;
      case "agent_started":
        agentStatuses.set(event.agent, "thinking");
        break;
      case "agent_message":
        if (!agentStatuses.has(event.agent)) {
          agentStatuses.set(event.agent, "thinking");
        }
        break;
      case "tool_called":
        agentStatuses.set(event.agent, "thinking");
        break;
      case "tool_result":
        if (!agentStatuses.has(event.agent)) {
          agentStatuses.set(event.agent, "thinking");
        }
        break;
      case "agent_finished":
        agentStatuses.set(event.agent, "done");
        break;
      case "run_finished":
        runStatus = "completed";
        finalOutput = event.output;
        break;
      case "run_failed":
        runStatus = "failed";
        error = event.error;
        break;
    }
  }

  if (runStatus === "failed") {
    for (const [agentName, status] of agentStatuses.entries()) {
      if (status === "thinking") {
        agentStatuses.set(agentName, "error");
      }
    }
  }

  return {
    agents: [...agentStatuses.entries()].map(([name, status]) => ({
      name,
      status,
    })),
    finalOutput,
    error,
    runStatus,
  };
}

export function useTroupeRun(events: TroupeEvent[]): TroupeRunState {
  const [state, setState] = useState<TroupeRunState>(() =>
    deriveTroupeRunState(events),
  );

  useEffect(() => {
    setState(deriveTroupeRunState(events));
  }, [events]);

  return state;
}
