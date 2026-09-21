export const CONNECTORS = [
  { id: 'supabase', name: 'Supabase', available: true, capabilities: ['Select a project', 'Read project configuration', 'Prepare approved development migrations'] },
  { id: 'vercel', name: 'Vercel', available: true, capabilities: ['Select a project', 'Read deployments and build status', 'Prepare approved previews'] },
  { id: 'github', name: 'GitHub', available: true, capabilities: ['Read synced issues', 'Controlled repository snapshots', 'Create approved multi-file branches and pull requests', 'Read repository checks and Vercel preview status'] },
  { id: 'gmail', name: 'Gmail', available: false, capabilities: ['Draft email'] },
  { id: 'drive', name: 'Google Drive', available: false, capabilities: ['Read selected documents'] },
  { id: 'slack', name: 'Slack', available: false, capabilities: ['Read selected channels'] },
  { id: 'notion', name: 'Notion', available: false, capabilities: ['Read selected pages'] },
  { id: 'instagram', name: 'Instagram', available: false, capabilities: ['Prepare posts'] },
  { id: 'canva', name: 'Canva', available: false, capabilities: ['Create designs'] },
  { id: 'higgsfield', name: 'Higgsfield', available: false, capabilities: ['Generate videos'] },
  { id: 'vscode', name: 'VS Code', available: false, capabilities: ['Controlled workspace access'] },
] as const;
export function connectorStatus(id: string, connection?: { status?: string; connection_type?: string }) {
  const connector = CONNECTORS.find(c => c.id === id);
  if (!connector?.available) return 'Coming soon';
  if (connection?.status === 'error') return 'Error';
  if (connection?.status === 'syncing') return 'Syncing';
  if (connection?.status === 'connected') return connection.connection_type === 'oauth' ? 'Connected' : 'Public read only';
  return 'Not connected';
}
