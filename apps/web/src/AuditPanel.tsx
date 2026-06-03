import { type AuditEvent } from "./api";
import { formatTime } from "./view-utils";
import "./audit-panel.css";

type AuditPanelProps = {
  events: AuditEvent[];
};

export function AuditPanel({ events }: AuditPanelProps) {
  return (
    <aside className="audit-panel">
      <h3>Audit</h3>
      <div className="audit-events">
        {events.map((event) => (
          <article className="audit-event" key={event.id}>
            <strong>{event.type}</strong>
            <span>{formatTime(event.createdAt)}</span>
            <small>{event.sessionName || event.hostId || event.message}</small>
          </article>
        ))}
      </div>
    </aside>
  );
}
