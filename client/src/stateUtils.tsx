import { Tag, Select } from 'antd';
import { transitionState } from './api';

// State transition rules (mirrors server/services/stateTransitions.js)
export const STATE_TRANSITIONS = [
  { role: 'Editor', action: 'submit', from: 'draft', to: 'submitted' },
  { role: 'Editor', action: 'delete', from: 'draft', to: 'deleted' },
  { role: 'Approver', action: 'approve', from: 'submitted', to: 'approved' },
  { role: 'Approver', action: 'reject', from: 'approved', to: 'draft' },
  { role: 'Publisher', action: 'publish', from: 'approved', to: 'published' },
  { role: 'Administrator', action: 'draft', from: 'staged', to: 'draft' },
];

export function getAllowedActions(role: string | null | undefined, currentState: string) {
  const state = (currentState || 'published').toLowerCase();
  if (role === 'Super') {
    return STATE_TRANSITIONS.filter(t => t.from === state);
  }
  return STATE_TRANSITIONS.filter(t => t.role === role && t.from === state);
}

export function stateTagColor(state: string): string {
  switch ((state || 'published').toLowerCase()) {
    case 'published': return 'green';
    case 'approved': return 'blue';
    case 'submitted': return 'orange';
    case 'staged': return 'purple';
    case 'deleted': return 'red';
    default: return 'default';
  }
}

/**
 * Renders a status Tag or Select dropdown for state transitions.
 */
export function renderStateCell(
  val: string | undefined,
  recordId: string,
  editingId: string | null,
  pendingStateAction: { action: string; to: string } | null,
  userRole: string | null | undefined,
  readOnly: boolean | undefined,
  onTransition: (action: string) => void,
) {
  const currentState = (val || 'published').toLowerCase();
  const actions = getAllowedActions(userRole, currentState);
  const displayState = (editingId === recordId && pendingStateAction) ? pendingStateAction.to : (val || 'published');
  const tagColor = stateTagColor(displayState);

  if (!actions.length || readOnly || editingId !== recordId) {
    return <Tag color={tagColor}>{displayState}</Tag>;
  }

  return (
    <Select
      size="small"
      value={pendingStateAction ? pendingStateAction.action : '__current__'}
      style={{ width: '100%' }}
      onChange={onTransition}
      options={[
        { label: <Tag color={tagColor}>{val || 'published'}</Tag>, value: '__current__', disabled: true },
        ...actions.map(a => ({ label: `${a.action} → ${a.to}`, value: a.action })),
      ]}
    />
  );
}

/**
 * Execute a state transition API call.
 */
export { transitionState };
