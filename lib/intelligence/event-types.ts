export const COMPANY_EVENT_TYPES = {
  issueOpened: 'issue_opened',
  issueClosed: 'issue_closed',
  taskCompleted: 'task_completed',
  decisionCreated: 'decision_created',
  customerSignal: 'customer_signal',
  actionCompleted: 'action_completed',
} as const;

export const ATTENTION_TYPES = {
  overdue: 'task_overdue', blocked: 'task_blocked', critical: 'task_critical',
  noMission: 'no_active_mission', insight: 'insight_review',
  approval: 'approval_waiting', execution: 'action_completed',
} as const;
export type AttentionType = typeof ATTENTION_TYPES[keyof typeof ATTENTION_TYPES];
