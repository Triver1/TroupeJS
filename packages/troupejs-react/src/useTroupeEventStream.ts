import { useEffect, useState } from "react";

import type { TroupeEvent } from "./types.ts";

export type StreamConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export interface UseTroupeEventStreamResult {
  connectionState: StreamConnectionState;
  error: string | null;
  events: TroupeEvent[];
}

export function useTroupeEventStream(
  url: string | null,
): UseTroupeEventStreamResult {
  const [events, setEvents] = useState<TroupeEvent[]>([]);
  const [connectionState, setConnectionState] =
    useState<StreamConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setEvents([]);
      setConnectionState("idle");
      setError(null);
      return;
    }

    setEvents([]);
    setConnectionState("connecting");
    setError(null);

    const source = new EventSource(url);

    source.onopen = () => {
      setConnectionState("open");
    };

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TroupeEvent;
        setEvents((currentEvents) => [...currentEvents, event]);
      } catch {
        setConnectionState("error");
        setError("Received an invalid troupe event payload.");
      }
    };

    source.onerror = () => {
      setConnectionState("error");
      setError("The troupe event stream closed unexpectedly.");
      source.close();
    };

    return () => {
      source.close();
      setConnectionState("closed");
    };
  }, [url]);

  return {
    connectionState,
    error,
    events,
  };
}
