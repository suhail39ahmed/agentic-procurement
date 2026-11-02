export type WebhookEvent = {
    id: string;
    eventType: string;
    createTime: string;
    raw: unknown;
    receivedAt: string;
  };
  
  const events = new Map<string, WebhookEvent>();
  
  export function saveEvent(event: WebhookEvent): boolean {
    if (events.has(event.id)) return false;
    events.set(event.id, event);
    return true;
  }
  
  export function listEvents(): WebhookEvent[] {
    return [...events.values()].sort((a, b) =>
      b.receivedAt.localeCompare(a.receivedAt)
    );
  }