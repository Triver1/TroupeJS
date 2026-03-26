import { TroupeError } from "../../lib/errors.ts";
import type { Message } from "../messages/Message.ts";
import { createMessage } from "../messages/Message.ts";
import type { Troupe } from "../troupes/Troupe.ts";
import { AgentExecutor } from "./AgentExecutor.ts";
import { sessionStore } from "./SessionStore.ts";

export class TroupeExecutor {
  static async send(troupe: Troupe, content: string): Promise<Message[]> {
    const troupeMessage = createMessage({
      role: "user",
      content,
      sender: troupe.name,
      scope: "troupe",
    });

    sessionStore.append(troupe.sessionId, troupeMessage);

    const results = await Promise.all(
      troupe.getAgents().map(async (agent, index) => {
        const response = await AgentExecutor.respond(agent, content, {
          sender: troupe.name,
          scope: "troupe",
          parentId: troupeMessage.id,
        });

        return { index, message: response.message };
      }),
    );

    const replies = results
      .sort((left, right) => left.index - right.index)
      .map((result) => result.message)
      .filter((message): message is Message => message !== null);

    for (const reply of replies) {
      sessionStore.append(troupe.sessionId, reply);
    }

    return replies;
  }

  static async sendTo(
    troupe: Troupe,
    agentName: string,
    content: string,
  ): Promise<Message | null> {
    const agent = troupe.getAgent(agentName);
    if (!agent) {
      throw new TroupeError(
        `Agent "${agentName}" is not part of troupe "${troupe.name}"`,
      );
    }

    const directedMessage = createMessage({
      role: "user",
      content,
      sender: troupe.name,
      target: agentName,
      scope: "directed",
    });

    sessionStore.append(troupe.sessionId, directedMessage);

    const response = await AgentExecutor.respond(agent, content, {
      sender: troupe.name,
      target: agentName,
      scope: "directed",
      parentId: directedMessage.id,
    });

    if (response.message) {
      sessionStore.append(troupe.sessionId, response.message);
    }

    return response.message;
  }
}

