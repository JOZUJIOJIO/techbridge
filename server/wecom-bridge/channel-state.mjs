const MEMBER_STATE_PATTERN = /^m_[a-f0-9]{26}$/;
const CHANNEL_STATE_PATTERN = /^r_([a-z0-9_]{1,28})$/;

export function isMemberState(state) {
  return MEMBER_STATE_PATTERN.test(String(state || ''));
}

export function channelRuleKey(state) {
  const match = String(state || '').match(CHANNEL_STATE_PATTERN);
  return match ? match[1] : '';
}

export function isContactWayState(state) {
  return isMemberState(state) || Boolean(channelRuleKey(state));
}

export function automationEventKey(state, externalUserId, reusableChannel = false) {
  return reusableChannel ? `${state}:${externalUserId}` : String(state || '');
}
