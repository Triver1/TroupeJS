import type { FormEvent } from "react";
import {
  startTransition,
  useDeferredValue,
  useRef,
  useState,
} from "react";
import {
  AgentStatusList,
  FinalReplyCard,
  TroupeTimeline,
  useTroupeRun,
  type AgentStatusEntry,
  type TroupeEvent,
} from "troupejs-react";
import type { Message } from "troupejs";

import {
  buildRuntime,
  defaultConfig,
  initialPlaygroundNodes,
  replyWriterId,
  troupeId,
  type PlaygroundConfig,
  type PlaygroundNode,
  type RuntimeHandles,
} from "./playgroundRuntime.ts";
import "./app.css";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  at: string;
}

const defaultPrompt = `Answer this customer email:

"Hi team, I upgraded this morning but my workspace still shows Free.
I need the extra seats before a client demo in two hours. Can you help?"`;

function formatKind(kind: PlaygroundNode["kind"]): string {
  switch (kind) {
    case "troupe":
      return "Troupe";
    case "agent":
      return "Agent";
    case "subagent":
      return "Subagent";
  }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function App() {
  const [nodes, setNodes] = useState(initialPlaygroundNodes);
  const [config, setConfig] = useState(defaultConfig);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [chatDraft, setChatDraft] = useState("");
  const [selectedId, setSelectedId] = useState(troupeId);
  const [events, setEvents] = useState<TroupeEvent[]>([]);
  const [chatHistoryByNode, setChatHistoryByNode] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activityLabel, setActivityLabel] = useState<string | null>(null);
  const deferredPrompt = useDeferredValue(prompt);
  const runState = useTroupeRun(events);
  const runtimeRef = useRef<RuntimeHandles | null>(null);
  const runtimeSignatureRef = useRef("");
  const eventCounterRef = useRef(1);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? nodes[0];

  const statusByName = new Map(
    runState.agents.map((status) => [status.name, status.status]),
  );

  const agentStatuses: AgentStatusEntry[] = nodes
    .filter((node) => node.kind !== "troupe")
    .map((node) => ({
      name: node.name,
      status: statusByName.get(node.name) ?? "idle",
    }));

  const selectedTimelineEvents = selectedNode.kind === "troupe"
    ? events
    : events.filter(
      (event) => "agent" in event && event.agent === selectedNode.name,
    );

  const selectedChat = selectedNode.kind === "troupe"
    ? []
    : (chatHistoryByNode[selectedNode.id] ?? []);
  const selectedParent = selectedNode.parentId
    ? nodes.find((node) => node.id === selectedNode.parentId) ?? null
    : null;
  const selectedChildren = nodes.filter((node) => node.parentId === selectedNode.id);
  const selectedStatus = selectedNode.kind === "troupe"
    ? runState.runStatus
    : (statusByName.get(selectedNode.name) ?? "idle");
  const busyAgentCount = agentStatuses.filter(
    (agent) =>
      agent.status !== "idle" &&
      agent.status !== "done" &&
      agent.status !== "completed",
  ).length;
  const topLevelAgentCount = nodes.filter(
    (node) => node.kind === "agent" && node.parentId === troupeId,
  ).length;
  const subagentCount = nodes.filter((node) => node.kind === "subagent").length;
  const completedAgentCount = agentStatuses.filter(
    (agent) => agent.status === "done" || agent.status === "completed",
  ).length;
  const latestEvent = selectedTimelineEvents[selectedTimelineEvents.length - 1] ?? null;

  function nextEventId(prefix: string): string {
    const current = eventCounterRef.current;
    eventCounterRef.current += 1;
    return `${prefix}-${current}`;
  }

  function appendEvents(nextEvents: TroupeEvent[]): void {
    startTransition(() => {
      setEvents((currentEvents) => [...currentEvents, ...nextEvents]);
    });
  }

  function ensureApiKey(): boolean {
    if (config.apiKey.trim()) {
      return true;
    }

    setErrorMessage(
      "Enter a provider API key in Runtime Controls before running the troupe.",
    );
    return false;
  }

  function runtimeSignature(currentNodes: PlaygroundNode[], currentConfig: PlaygroundConfig) {
    return JSON.stringify({
      apiKey: currentConfig.apiKey,
      baseUrl: currentConfig.baseUrl,
      model: currentConfig.model,
      nodes: currentNodes.map((node) => ({
        id: node.id,
        model: node.model,
        name: node.name,
        parentId: node.parentId,
        systemPrompt: node.systemPrompt,
        temperature: node.temperature,
      })),
      provider: currentConfig.provider,
      temperature: currentConfig.temperature,
    });
  }

  function appendAgentMessage(node: PlaygroundNode, message: Message): void {
    appendEvents([
      {
        id: nextEventId("message"),
        type: "agent_message",
        at: new Date(message.createdAt).toISOString(),
        agent: node.name,
        content: message.content,
      },
    ]);
  }

  function getRuntime(): RuntimeHandles {
    const signature = runtimeSignature(nodes, config);

    if (!runtimeRef.current || runtimeSignatureRef.current !== signature) {
      runtimeRef.current = buildRuntime(nodes, config, appendAgentMessage);
      runtimeSignatureRef.current = signature;
    }

    return runtimeRef.current;
  }

  function updateNode(
    nodeId: string,
    patch: Partial<Pick<PlaygroundNode, "model" | "notes" | "systemPrompt" | "temperature">>,
  ): void {
    runtimeRef.current = null;
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId
          ? {
            ...node,
            ...patch,
          }
          : node
      ));
  }

  async function handleRunTroupe(): Promise<void> {
    if (!ensureApiKey()) {
      return;
    }

    setErrorMessage(null);
    setActivityLabel("Running troupe");
    setSelectedId(troupeId);
    setEvents([]);

    const runtime = getRuntime();
    const topLevelNodes = nodes.filter(
      (node) => node.kind === "agent" && node.parentId === troupeId,
    );
    const promptText = prompt.trim();

    appendEvents([
      {
        id: nextEventId("run"),
        type: "run_started",
        at: new Date().toISOString(),
        prompt: promptText,
      },
      ...topLevelNodes.map((node) => ({
        id: nextEventId("agent"),
        type: "agent_started" as const,
        at: new Date().toISOString(),
        agent: node.name,
      })),
    ]);

    try {
      await runtime.troupe.send(promptText);

      appendEvents(
        topLevelNodes.map((node) => ({
          id: nextEventId("agent"),
          type: "agent_finished" as const,
          at: new Date().toISOString(),
          agent: node.name,
        })),
      );

      const replyWriter = nodes.find((node) => node.id === replyWriterId);

      if (replyWriter) {
        appendEvents([
          {
            id: nextEventId("agent"),
            type: "agent_started",
            at: new Date().toISOString(),
            agent: replyWriter.name,
          },
        ]);

        const finalReply = await runtime.troupe.sendTo(
          replyWriter.name,
          "Using the troupe discussion above, write the final customer-facing answer in under 120 words.",
        );

        appendEvents([
          {
            id: nextEventId("agent"),
            type: "agent_finished",
            at: new Date().toISOString(),
            agent: replyWriter.name,
          },
          {
            id: nextEventId("run"),
            type: "run_finished",
            at: new Date().toISOString(),
            output: finalReply?.content ?? "No final reply was generated.",
          },
        ]);
      }
    } catch (error) {
      appendEvents([
        {
          id: nextEventId("run"),
          type: "run_failed",
          at: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown troupe failure",
        },
      ]);

      setErrorMessage(
        error instanceof Error ? error.message : "Unknown troupe failure",
      );
    } finally {
      setActivityLabel(null);
    }
  }

  async function handleSendToSelected(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (selectedNode.kind === "troupe" || !ensureApiKey()) {
      return;
    }

    const content = chatDraft.trim();

    if (!content) {
      return;
    }

    setErrorMessage(null);
    setActivityLabel(`Talking to ${selectedNode.name}`);
    setChatDraft("");

    const userMessage: ChatMessage = {
      id: nextEventId("chat"),
      role: "user",
      content,
      at: new Date().toISOString(),
    };

    setChatHistoryByNode((currentChats) => ({
      ...currentChats,
      [selectedNode.id]: [...(currentChats[selectedNode.id] ?? []), userMessage],
    }));

    appendEvents([
      {
        id: nextEventId("agent"),
        type: "agent_started",
        at: new Date().toISOString(),
        agent: selectedNode.name,
      },
    ]);

    try {
      const runtime = getRuntime();
      let replyContent: string | null = null;

      if (selectedNode.kind === "subagent") {
        const parentAgent = runtime.parentAgentBySubagentId.get(selectedNode.id);

        if (!parentAgent) {
          throw new Error(`Missing parent agent for ${selectedNode.name}.`);
        }

        replyContent = await parentAgent.sendToSubagent(selectedNode.name, content);
      } else {
        const reply = await runtime.troupe.sendTo(selectedNode.name, content);
        replyContent = reply?.content ?? null;
      }

      appendEvents([
        {
          id: nextEventId("agent"),
          type: "agent_finished",
          at: new Date().toISOString(),
          agent: selectedNode.name,
        },
      ]);

      if (replyContent) {
        setChatHistoryByNode((currentChats) => ({
          ...currentChats,
          [selectedNode.id]: [
            ...(currentChats[selectedNode.id] ?? []),
            {
              id: nextEventId("chat"),
              role: "agent",
              content: replyContent,
              at: new Date().toISOString(),
            },
          ],
        }));
      }
    } catch (error) {
      appendEvents([
        {
          id: nextEventId("run"),
          type: "run_failed",
          at: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown agent failure",
        },
      ]);

      setErrorMessage(
        error instanceof Error ? error.message : "Unknown agent failure",
      );
    } finally {
      setActivityLabel(null);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar-card app-card">
        <header className="sidebar-header">
          <div className="brand-mark" aria-hidden="true">
            <span>TJ</span>
          </div>
          <div>
            <p className="brand-label">TroupeJS Playground</p>
            <p className="brand-subtle">Multi-agent operations console</p>
          </div>
        </header>

        <section className="sidebar-section">
          <div className="section-head">
            <span className="section-kicker">Workspace Snapshot</span>
            <span className="section-pill">Live</span>
          </div>

          <div className="sidebar-summary-grid">
            <article className="sidebar-summary-card">
              <span>Top-level agents</span>
              <strong>{topLevelAgentCount}</strong>
              <small>{busyAgentCount} active now</small>
            </article>
            <article className="sidebar-summary-card">
              <span>Specialists</span>
              <strong>{subagentCount}</strong>
              <small>{completedAgentCount} completed</small>
            </article>
            <article className="sidebar-summary-card sidebar-summary-card-wide">
              <span>Focused stream</span>
              <strong>
                {selectedTimelineEvents.length}
                {" "}
                event{selectedTimelineEvents.length === 1 ? "" : "s"}
              </strong>
              <small>
                {latestEvent ? `Last update ${formatTime(latestEvent.at)}` : "No activity yet"}
              </small>
            </article>
          </div>
        </section>

        <section className="sidebar-section">
          <div className="section-head">
            <span className="section-kicker">System Map</span>
          </div>

          <div className="nav-list">
            <button
              className={selectedNode.id === troupeId ? "nav-item nav-item-active" : "nav-item"}
              onClick={() => setSelectedId(troupeId)}
              type="button"
            >
              <div>
                <span className="nav-kind">Troupe</span>
                <strong>support-inbox</strong>
              </div>
              <span className={`status-badge status-badge-${runState.runStatus}`}>
                {formatStatusLabel(runState.runStatus)}
              </span>
            </button>

            {nodes.filter((node) => node.parentId === troupeId).map((node) => {
              const childNodes = nodes.filter((childNode) => childNode.parentId === node.id);
              const nodeStatus = statusByName.get(node.name) ?? "idle";

              return (
                <div className="nav-group" key={node.id}>
                  <button
                    className={selectedNode.id === node.id ? "nav-item nav-item-active" : "nav-item"}
                    onClick={() => setSelectedId(node.id)}
                    type="button"
                  >
                    <div>
                      <span className="nav-kind">{formatKind(node.kind)}</span>
                      <strong>{node.name}</strong>
                    </div>
                    <span className={`status-badge status-badge-${nodeStatus}`}>
                      {formatStatusLabel(nodeStatus)}
                    </span>
                  </button>

                  {childNodes.map((childNode) => {
                    const childStatus = statusByName.get(childNode.name) ?? "idle";

                    return (
                      <button
                        className={selectedNode.id === childNode.id
                          ? "nav-item nav-item-sub nav-item-active"
                          : "nav-item nav-item-sub"}
                        key={childNode.id}
                        onClick={() => setSelectedId(childNode.id)}
                        type="button"
                      >
                        <div>
                          <span className="nav-kind">{formatKind(childNode.kind)}</span>
                          <strong>{childNode.name}</strong>
                        </div>
                        <span className={`status-badge status-badge-${childStatus}`}>
                          {formatStatusLabel(childStatus)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section className="sidebar-section">
          <div className="section-head">
            <span className="section-kicker">Node Configuration</span>
            <span className="section-pill">{formatKind(selectedNode.kind)}</span>
          </div>

          <div className="field-stack">
            <label className="field">
              <span>Model</span>
              <input
                onChange={(event) =>
                  updateNode(selectedNode.id, { model: event.target.value })}
                value={selectedNode.model}
              />
            </label>

            <label className="field">
              <span>Temperature</span>
              <input
                max="1"
                min="0"
                onChange={(event) =>
                  updateNode(selectedNode.id, {
                    temperature: Number(event.target.value),
                  })}
                step="0.1"
                type="range"
                value={selectedNode.temperature}
              />
              <small>{selectedNode.temperature.toFixed(1)}</small>
            </label>

            <label className="field">
              <span>System prompt</span>
              <textarea
                onChange={(event) =>
                  updateNode(selectedNode.id, { systemPrompt: event.target.value })}
                rows={6}
                value={selectedNode.systemPrompt}
              />
            </label>

            <label className="field">
              <span>Notes</span>
              <textarea
                onChange={(event) =>
                  updateNode(selectedNode.id, { notes: event.target.value })}
                rows={5}
                value={selectedNode.notes}
              />
            </label>
          </div>
        </section>
      </aside>

      <section className="main-card app-card">
        <header className="main-header">
          <div>
            <p className="section-kicker">Operations Dashboard</p>
            <h1>{selectedNode.name}</h1>
            <p className="main-header-copy">{selectedNode.description}</p>
          </div>
          <div className="main-header-meta">
            {activityLabel ? <span className="section-pill">{activityLabel}</span> : null}
            <span className={`status-badge status-badge-${selectedStatus}`}>
              {formatStatusLabel(selectedStatus)}
            </span>
          </div>
        </header>

        <div className="main-scroll">
          <section className="main-section main-section-wide dashboard-metrics">
            <div className="section-head">
              <span className="section-kicker">Run Summary</span>
              <span className="section-pill">
                {runState.runStatus === "idle" ? "Ready" : formatStatusLabel(runState.runStatus)}
              </span>
            </div>

            <div className="metrics-grid">
              <article className="metric-card">
                <span className="metric-label">Run status</span>
                <strong className="metric-value">
                  {formatStatusLabel(runState.runStatus)}
                </strong>
                <span className="metric-meta">
                  {runState.runStatus === "idle"
                    ? "Runtime standing by"
                    : runState.runStatus === "failed"
                      ? "Attention required"
                      : "Run is active"}
                </span>
              </article>

              <article className="metric-card">
                <span className="metric-label">Current focus</span>
                <strong className="metric-value">{selectedNode.name}</strong>
                <span className="metric-meta">{formatKind(selectedNode.kind)}</span>
              </article>

              <article className="metric-card">
                <span className="metric-label">Agent roster</span>
                <strong className="metric-value">{agentStatuses.length}</strong>
                <span className="metric-meta">{busyAgentCount} actively processing</span>
              </article>

              <article className="metric-card">
                <span className="metric-label">Trace events</span>
                <strong className="metric-value">{events.length}</strong>
                <span className="metric-meta">
                  {selectedTimelineEvents.length} in current view
                </span>
              </article>
            </div>
          </section>

          <section className="main-section">
            <div className="section-head">
              <span className="section-kicker">Runtime Controls</span>
              <button className="primary-button" onClick={handleRunTroupe} type="button">
                Run troupe
              </button>
            </div>

            <div className="config-grid">
              <label className="field">
                <span>Provider</span>
                <select
                  onChange={(event) =>
                    {
                      const nextModel = event.target.value === "openai"
                        ? "gpt-4.1-mini"
                        : event.target.value === "deepseek"
                          ? "deepseek-chat"
                          : "gemini-3-flash-preview";

                      runtimeRef.current = null;
                      setConfig((currentConfig) => ({
                        ...currentConfig,
                        provider: event.target.value as PlaygroundConfig["provider"],
                        model: nextModel,
                      }));
                      setNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                          ...node,
                          model: nextModel,
                        })));
                    }}
                  value={config.provider}
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </label>

              <label className="field">
                <span>Model</span>
                <input
                  onChange={(event) =>
                    {
                      runtimeRef.current = null;
                      setConfig((currentConfig) => ({
                        ...currentConfig,
                        model: event.target.value,
                      }));
                      setNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                          ...node,
                          model: event.target.value,
                        })));
                    }}
                  value={config.model}
                />
              </label>

              <label className="field">
                <span>API key</span>
                <input
                  onChange={(event) =>
                    setConfig((currentConfig) => ({
                      ...currentConfig,
                      apiKey: event.target.value,
                    }))}
                  placeholder="Provider API key"
                  type="password"
                  value={config.apiKey}
                />
              </label>

              <label className="field">
                <span>Base URL</span>
                <input
                  onChange={(event) =>
                    setConfig((currentConfig) => ({
                      ...currentConfig,
                      baseUrl: event.target.value,
                    }))}
                  placeholder="Optional override"
                  value={config.baseUrl}
                />
              </label>

              <label className="field field-wide">
                <span>Global temperature</span>
                <input
                  max="1"
                  min="0"
                  onChange={(event) =>
                    {
                      const nextTemperature = Number(event.target.value);

                      runtimeRef.current = null;
                      setConfig((currentConfig) => ({
                        ...currentConfig,
                        temperature: nextTemperature,
                      }));
                      setNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                          ...node,
                          temperature: nextTemperature,
                        })));
                    }}
                  step="0.1"
                  type="range"
                  value={config.temperature}
                />
                <small>{config.temperature.toFixed(1)}</small>
              </label>

              <label className="field field-wide">
                <span>Scenario prompt</span>
                <textarea
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={6}
                  spellCheck={false}
                  value={prompt}
                />
              </label>
            </div>

            <p className="helper-copy">
              Prompt preview: {deferredPrompt.slice(0, 180)}
              {deferredPrompt.length > 180 ? "..." : ""}
            </p>
            {errorMessage ? <p className="error-copy">{errorMessage}</p> : null}
          </section>

          <section className="main-section">
            <div className="section-head">
              <span className="section-kicker">Node Summary</span>
              <span className="section-pill">{formatKind(selectedNode.kind)}</span>
            </div>

            <p className="body-copy">{selectedNode.description}</p>

            <div className="meta-grid">
              <div className="meta-row">
                <span>Model</span>
                <strong>{selectedNode.model}</strong>
              </div>
              {selectedParent
                ? (
                  <div className="meta-row">
                    <span>Parent</span>
                    <strong>{selectedParent.name}</strong>
                  </div>
                )
                : null}
              {selectedChildren.length > 0
                ? (
                  <div className="meta-row meta-row-stack">
                    <span>Children</span>
                    <div className="chip-row">
                      {selectedChildren.map((childNode) => (
                        <button
                          className="child-chip"
                          key={childNode.id}
                          onClick={() => setSelectedId(childNode.id)}
                          type="button"
                        >
                          {childNode.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
                : null}
            </div>

            {selectedNode.kind === "troupe"
              ? (
                <div className="stack-gap">
                  <FinalReplyCard
                    output={runState.finalOutput}
                    title="Latest Troupe Reply"
                  />
                  <AgentStatusList agents={agentStatuses} title="Agent Status" />
                </div>
              )
              : (
                <div className="note-panel">
                  <p className="section-kicker">Notes</p>
                  <p>{selectedNode.notes}</p>
                </div>
              )}
          </section>

          <section className="main-section main-section-wide">
            <div className="section-head">
              <span className="section-kicker">Execution Trace</span>
              <span className="section-pill">
                {selectedTimelineEvents.length} event
                {selectedTimelineEvents.length === 1 ? "" : "s"}
              </span>
            </div>

            {selectedTimelineEvents.length > 0
              ? (
                <TroupeTimeline
                  events={selectedTimelineEvents}
                  title={selectedNode.kind === "troupe"
                    ? "Troupe timeline"
                    : `${selectedNode.name} timeline`}
                />
              )
              : (
                <div className="empty-panel">
                  <strong>No events yet</strong>
                  <p>Start a run or open a direct session to populate the activity stream.</p>
                </div>
              )}
          </section>

          <section className="main-section main-section-wide">
            <div className="section-head">
              <span className="section-kicker">Operator Console</span>
              <span className="section-pill">
                {selectedNode.kind === "troupe"
                  ? "Select an agent"
                  : `Session with ${selectedNode.name}`}
              </span>
            </div>

            {selectedNode.kind === "troupe"
              ? (
                <div className="empty-panel">
                  <strong>Direct sessions are agent-scoped.</strong>
                  <p>Select an agent or subagent from the sidebar to open a one-to-one exchange.</p>
                </div>
              )
              : (
                <>
                  <div className="chat-list">
                    {selectedChat.length > 0
                      ? selectedChat.map((message) => (
                        <article
                          className={message.role === "user"
                            ? "chat-message chat-message-user"
                            : "chat-message chat-message-agent"}
                          key={message.id}
                        >
                          <header>
                            <strong>
                              {message.role === "user" ? "Operator" : selectedNode.name}
                            </strong>
                            <span>{formatTime(message.at)}</span>
                          </header>
                          <p>{message.content}</p>
                        </article>
                      ))
                      : (
                        <div className="empty-panel empty-panel-compact">
                          <strong>No direct chat yet</strong>
                          <p>Use this panel to talk to a single agent with the real runtime.</p>
                        </div>
                      )}
                  </div>

                  <form className="chat-form" onSubmit={handleSendToSelected}>
                    <textarea
                      onChange={(event) => setChatDraft(event.target.value)}
                      placeholder={`Message ${selectedNode.name}...`}
                      rows={4}
                      spellCheck={false}
                      value={chatDraft}
                    />
                    <button className="primary-button" type="submit">
                      Send to {selectedNode.name}
                    </button>
                  </form>
                </>
              )}
          </section>
        </div>
      </section>
    </main>
  );
}
