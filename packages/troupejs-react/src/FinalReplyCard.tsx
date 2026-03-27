import type { CSSProperties } from "react";

const wrapperStyle: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.96))",
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: "18px",
  boxShadow: "0 18px 34px rgba(15, 23, 42, 0.16)",
  color: "#e2e8f0",
  display: "grid",
  gap: "0.95rem",
  overflow: "hidden",
  padding: "1.15rem",
  position: "relative",
};

const glowStyle: CSSProperties = {
  background: "radial-gradient(circle at top right, rgba(59, 130, 246, 0.28), transparent 42%)",
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
};

const headerStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: "0.75rem",
  justifyContent: "space-between",
  position: "relative",
};

const titleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: "1rem",
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: 0,
};

const badgeStyle: CSSProperties = {
  border: "1px solid rgba(191, 219, 254, 0.18)",
  borderRadius: "999px",
  color: "#bfdbfe",
  fontSize: "0.7rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  padding: "0.38rem 0.62rem",
  textTransform: "uppercase",
};

const bodyWrapStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.05)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "14px",
  padding: "1rem",
  position: "relative",
};

const bodyStyle: CSSProperties = {
  lineHeight: 1.7,
  margin: 0,
  minHeight: "6rem",
  whiteSpace: "pre-wrap",
};

export interface FinalReplyCardProps {
  output: string | null;
  title?: string;
}

export function FinalReplyCard({
  output,
  title = "Final Reply",
}: FinalReplyCardProps) {
  return (
    <section aria-label={title} style={wrapperStyle}>
      <div aria-hidden="true" style={glowStyle} />
      <div style={headerStyle}>
        <h2 style={titleStyle}>{title}</h2>
        <span style={badgeStyle}>{output ? "Ready" : "Pending"}</span>
      </div>
      <div style={bodyWrapStyle}>
        <p
          style={{
            ...bodyStyle,
            color: output ? "#e2e8f0" : "rgba(226, 232, 240, 0.72)",
          }}
        >
          {output ??
            "No final reply yet. Start a run and the latest customer-facing response will appear here."}
        </p>
      </div>
    </section>
  );
}
