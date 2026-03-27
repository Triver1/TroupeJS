import type { CSSProperties } from "react";

import type { AgentStatusEntry } from "./types.ts";

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
  gap: "0.75rem",
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const itemStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--surface-raised, rgba(255, 255, 255, 0.94))",
  border: "1px solid var(--surface-border, rgba(15, 23, 42, 0.08))",
  borderRadius: "16px",
  display: "flex",
  gap: "0.9rem",
  justifyContent: "space-between",
  padding: "0.95rem 1rem",
};

const labelClusterStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
};

const eyebrowStyle: CSSProperties = {
  color: "var(--text-muted, #64748b)",
  fontSize: "0.68rem",
  fontWeight: 800,
  letterSpacing: "0.12em",
  margin: 0,
  textTransform: "uppercase",
};

const labelStyle: CSSProperties = {
  color: "var(--text-primary, #0f172a)",
  fontSize: "0.96rem",
  fontWeight: 700,
};

const captionStyle: CSSProperties = {
  color: "var(--text-secondary, #475569)",
  fontSize: "0.82rem",
  margin: 0,
};

const statusClusterStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: "0.55rem",
};

const dotStyle: CSSProperties = {
  borderRadius: "999px",
  boxShadow: "0 0 0 4px rgba(255, 255, 255, 0.9)",
  height: "0.7rem",
  width: "0.7rem",
};

const pillStyle: CSSProperties = {
  borderRadius: "999px",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  padding: "0.4rem 0.68rem",
  textTransform: "uppercase",
};

const statusMetaByState: Record<
  AgentStatusEntry["status"],
  {
    caption: string;
    color: string;
    dot: string;
    pillBackground: string;
  }
> = {
  idle: {
    caption: "Ready for the next request",
    color: "#475569",
    dot: "#94a3b8",
    pillBackground: "rgba(148, 163, 184, 0.14)",
  },
  thinking: {
    caption: "Actively reasoning or using tools",
    color: "#b45309",
    dot: "#f59e0b",
    pillBackground: "rgba(245, 158, 11, 0.14)",
  },
  done: {
    caption: "Completed the current assignment",
    color: "#047857",
    dot: "#10b981",
    pillBackground: "rgba(16, 185, 129, 0.12)",
  },
  error: {
    caption: "Run ended with an error state",
    color: "#b91c1c",
    dot: "#ef4444",
    pillBackground: "rgba(239, 68, 68, 0.12)",
  },
};

export interface AgentStatusListProps {
  agents: AgentStatusEntry[];
  title?: string;
}

export function AgentStatusList({
  agents,
  title = "Agents",
}: AgentStatusListProps) {
  return (
    <section aria-label={title} style={sectionStyle}>
      <h2 style={titleStyle}>{title}</h2>
      <ul style={listStyle}>
        {agents.map((agent) => {
          const meta = statusMetaByState[agent.status];

          return (
            <li key={agent.name} style={itemStyle}>
              <div style={labelClusterStyle}>
                <p style={eyebrowStyle}>Agent</p>
                <span style={labelStyle}>{agent.name}</span>
                <p style={captionStyle}>{meta.caption}</p>
              </div>
              <div style={statusClusterStyle}>
                <span
                  aria-hidden="true"
                  style={{ ...dotStyle, background: meta.dot }}
                />
                <span
                  style={{
                    ...pillStyle,
                    background: meta.pillBackground,
                    color: meta.color,
                  }}
                >
                  {agent.status}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
