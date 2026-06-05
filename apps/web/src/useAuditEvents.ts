import { useCallback, useState } from "react";
import { listAuditEvents, type AuditEvent } from "./api";
import { errorMessage } from "./view-utils";

export function useAuditEvents(onError: (message: string) => void) {
  const [events, setEvents] = useState<AuditEvent[]>([]);

  const refresh = useCallback(async () => {
    try {
      setEvents(await listAuditEvents());
    } catch (err) {
      onError(errorMessage(err));
    }
  }, [onError]);

  return { events, refresh };
}
