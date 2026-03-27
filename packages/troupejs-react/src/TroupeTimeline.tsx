import type { CSSProperties } from "react";

import type { TroupeEvent } from "./types.ts";

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
};

const titleStyle: CSSProperties = {
  color: "var(--text-primary, #0f172a)",
  fontSize: "1rem",
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: 0,
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const itemStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "16px minmax(0, 1fr)",
};

const railStyle: CSSProperties = {
  alignItems: "center",
  display: "grid",
  gridTemplateRows: "14px minmax(0, 1fr)",
  justifyItems: "center",
};

const dotStyle: CSSProperties = {
  borderRadius: "999px",
  boxShadow: "0 0 0 4px rgba(255, 255, 255, 0.9)",
  height: "10px",
  width: "10px",
};

const connectorStyle: CSSProperties = {
  background: "linear-gradient(180deg, rgba(148, 163, 184, 0.45), transparent)",
  borderRadius: "999px",
  marginTop: "0.2rem",
  minHeight: "100%",
  width: "2px",
};

const cardStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid var(--surface-border, rgba(15, 23, 42, 0.08))",
  padding: "1rem 1.05rem",
};

const headerStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.65rem",
  justifyContent: "space-between",
  marginBottom: "0.7rem",
};

const tagStyle: CSSProperties = {
  borderRadius: "999px",
  fontSize: "0.7rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  padding: "0.38rem 0.62rem",
  textTransform: "uppercase",
};

const timeStyle: CSSProperties = {
  color: "var(--text-muted, #64748b)",
  fontSize: "0.78rem",
  fontWeight: 700,
};

const contentStyle: CSSProperties = {
  color: "var(--text-primary, #0f172a)",
  lineHeight: 1.65,
  margin: 0,
  whiteSpace: "pre-wrap",
};

const toneByEventType: Record<
  TroupeEvent["type"],
  {
    accent: string;
    cardBackground: string;
    cardBorder: string;
    tagBackground: string;
    tagColor: string;
  }
> = {
  run_started: {
    accent: "#2563eb",
    cardBackground: "rgba(239, 246, 255, 0.8)",
    cardBorder: "rgba(37, 99, 235, 0.18)",
    tagBackground: "rgba(37, 99, 235, 0.12)",
    tagColor: "#1d4ed8",
  },
  agent_started: {
    accent: "#f59e0b",
    cardBackground: "rgba(255, 251, 235, 0.8)",
    cardBorder: "rgba(245, 158, 11, 0.18)",
    tagBackground: "rgba(245, 158, 11, 0.14)",
    tagColor: "#b45309",
  },
  agent_message: {
    accent: "#0f172a",
    cardBackground: "rgba(255, 255, 255, 0.92)",
    cardBorder: "rgba(15, 23, 42, 0.08)",
    tagBackground: "rgba(148, 163, 184, 0.14)",
    tagColor: "#334155",
  },
  tool_called: {
    accent: "#7c3aed",
    cardBackground: "rgba(245, 243, 255, 0.86)",
    cardBorder: "rgba(124, 58, 237, 0.16)",
    tagBackground: "rgba(124, 58, 237, 0.14)",
    tagColor: "#6d28d9",
  },
  tool_result: {
    accent: "#0891b2",
    cardBackground: "rgba(236, 254, 255, 0.85)",
    cardBorder: "rgba(8, 145, 178, 0.16)",
    tagBackground: "rgba(8, 145, 178, 0.12)",
    tagColor: "#0f766e",
  },
  agent_finished: {
    accent: "#10b981",
    cardBackground: "rgba(236, 253, 245, 0.84)",
    cardBorder: "rgba(16, 185, 129, 0.18)",
    tagBackground: "rgba(16, 185, 129, 0.12)",
    tagColor: "#047857",
  },
  run_finished: {
    accent: "#0f766e",
    cardBackground: "rgba(240, 253, 250, 0.92)",
    cardBorder: "rgba(15, 118, 110, 0.16)",
    tagBackground: "rgba(15, 118, 110, 0.12)",
    tagColor: "#0f766e",
  },
  run_failed: {
    accent: "#dc2626",
    cardBackground: "rgba(254, 242, 242, 0.92)",
    cardBorder: "rgba(220, 38, 38, 0.16)",
    tagBackground: "rgba(220, 38, 38, 0.12)",
    tagColor: "#b91c1c",
  },
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
}

function describeEvent(event: TroupeEvent): string {
  switch (event.type) {
    case "run_started":
      return event.prompt;
    case "agent_started":
      return `${event.agent} started processing the request.`;
    case "agent_message":
      return event.content;
    case "tool_called":
      return `${event.agent} called ${event.tool}.`;
    case "tool_result":
      return event.content;
    case "agent_finished":
      return `${event.agent} completed its turn.`;
    case "run_finished":
      return event.output;
    case "run_failed":
      return event.error;
  }
}

function labelEvent(event: TroupeEvent): string {
  switch (event.type) {
    case "run_started":
      return "Run opened";
    case "agent_started":
      return "Agent active";
    case "agent_message":
      return event.agent;
    case "tool_called":
      return `${event.agent} tool`;
    case "tool_result":
      return `${event.agent} result`;
    case "agent_finished":
      return "Agent closed";
    case "run_finished":
      return "Final reply";
    case "run_failed":
      return "Run failed";
  }
}

export interface TroupeTimelineProps {
  events: TroupeEvent[];
  title?: string;
}

export function TroupeTimeline({
  events,
  title = "Timeline",
}: TroupeTimelineProps) {
  return (
    <section aria-label={title} style={sectionStyle}>
      <h2 style={titleStyle}>{title}</h2>
      <ol style={listStyle}>
        {events.map((event, index) => {
          const tone = toneByEventType[event.type];

          return (
            <li key={event.id} style={itemStyle}>
              <div aria-hidden="true" style={railStyle}>
                <span style={{ ...dotStyle, background: tone.accent }} />
                {index === events.length - 1 ? null : <span style={connectorStyle} />}
              </div>
              <article
                style={{
                  ...cardStyle,
                  background: tone.cardBackground,
                  borderColor: tone.cardBorder,
                }}
              >
                <div style={headerStyle}>
                  <span
                    style={{
                      ...tagStyle,
                      background: tone.tagBackground,
                      color: tone.tagColor,
                    }}
                  >
                    {labelEvent(event)}
                  </span>
                  <span style={timeStyle}>{formatTime(event.at)}</span>
                </div>
                <p style={contentStyle}>{describeEvent(event)}</p>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
