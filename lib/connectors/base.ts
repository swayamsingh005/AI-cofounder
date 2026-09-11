export const PROVIDERS = [
  { id: 'github', name: 'GitHub', icon: '⌘', available: true, description: 'Public repository issues · read only' },
  { id: 'posthog', name: 'PostHog', icon: '◩', available: false, description: 'Analytics integration needs setup' },
  { id: 'stripe', name: 'Stripe', icon: 'S', available: false, description: 'Billing integration needs setup' },
  { id: 'notion', name: 'Notion', icon: 'N', available: false, description: 'Document integration needs setup' },
] as const;
export type ConnectorEvent = { external_id: string; event_type: string; title: string; description: string; severity: string; payload: Record<string, unknown>; occurred_at: string };
export interface Connector {
  provider: string;
  capabilities: { read: boolean; write: boolean; execute: boolean; supportedActions: string[] };
  sync(resource: string): Promise<{ events: ConnectorEvent[]; metadata: Record<string, unknown> }>;
}
export function repositoryName(value: string): string {
  const name = value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
  if (!/^[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_.-]{1,100}$/.test(name) || name.includes('..')) throw new Error('Enter a public GitHub repository as owner/repository.');
  return name;
}
