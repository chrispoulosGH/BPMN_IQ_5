/**
 * State transition rules by role.
 * Super User can perform all transitions.
 */

const transitions = [
  { role: 'Editor', action: 'submit', from: 'draft', to: 'submitted' },
  { role: 'Editor', action: 'delete', from: 'draft', to: 'deleted' },
  { role: 'Approver', action: 'approve', from: 'submitted', to: 'approved' },
  { role: 'Approver', action: 'reject', from: 'approved', to: 'draft' },
  { role: 'Publisher', action: 'publish', from: 'approved', to: 'published' },
  { role: 'Administrator', action: 'draft', from: 'staged', to: 'draft' },
  { role: 'Administrator', action: 'stage', from: 'invalid', to: 'staged' },
];

const VALID_STATES = ['invalid', 'staged', 'draft', 'submitted', 'approved', 'rejected', 'published', 'deleted'];

/**
 * Get allowed transitions for a given role and current state.
 * Super User gets all transitions from that state.
 */
function getAllowedActions(role, currentState) {
  if (role === 'Super') {
    // Super can do any defined transition from the current state
    return transitions.filter(t => t.from === currentState);
  }
  return transitions.filter(t => t.role === role && t.from === currentState);
}

/**
 * Check if a role can perform a specific action on a record in a given state.
 */
function canTransition(role, action, currentState) {
  if (role === 'Super') {
    return transitions.some(t => t.action === action && t.from === currentState);
  }
  return transitions.some(t => t.role === role && t.action === action && t.from === currentState);
}

/**
 * Get the target state for a given action from a given state (role-checked).
 * Returns null if not allowed.
 */
function getTargetState(role, action, currentState) {
  let rule;
  if (role === 'Super') {
    rule = transitions.find(t => t.action === action && t.from === currentState);
  } else {
    rule = transitions.find(t => t.role === role && t.action === action && t.from === currentState);
  }
  return rule ? rule.to : null;
}

module.exports = { transitions, VALID_STATES, getAllowedActions, canTransition, getTargetState };
