import {
  ANNUAL_MEMBER_AUTOMATION,
  ANNUAL_MEMBER_RULE_KEY,
  SKILL_EMAIL_AUTOMATION,
  SKILL_EMAIL_RULE_KEY
} from './commerce-rules.mjs';

function headers(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

function baseUrl(env) {
  return env.SUPABASE_URL.replace(/\/$/, '');
}

function defaultRule(env, automation) {
  return {
    rule_key: automation.ruleKey,
    name: automation.name,
    enabled: true,
    source_channel: automation.sourceChannel,
    customer_type: automation.customerType,
    wecom_user_id: env.WECOM_CONTACT_USER_ID,
    tag_names: [...automation.tagNames],
    welcome_message: automation.welcomeMessage,
    group_key: automation.groupKey,
    group_name: automation.groupName,
    send_group_invite: true,
    notify_feishu: true,
    write_attribution: true,
    fallback: true
  };
}

export function defaultSkillEmailRule(env) {
  return defaultRule(env, SKILL_EMAIL_AUTOMATION);
}

export function defaultMemberRule(env) {
  return defaultRule(env, ANNUAL_MEMBER_AUTOMATION);
}

function fallbackRule(env, ruleKey) {
  if (ruleKey === SKILL_EMAIL_RULE_KEY) return defaultSkillEmailRule(env);
  if (ruleKey === ANNUAL_MEMBER_RULE_KEY) return defaultMemberRule(env);
  return null;
}

function isActive(rule) {
  if (!rule?.enabled) return false;
  const now = Date.now();
  if (rule.valid_from && new Date(rule.valid_from).getTime() > now) return false;
  if (rule.valid_until && new Date(rule.valid_until).getTime() < now) return false;
  return true;
}

export async function loadAutomationRule(env, ruleKey) {
  const params = new URLSearchParams({
    rule_key: `eq.${ruleKey}`,
    select: '*',
    limit: '1'
  });
  try {
    const response = await fetch(`${baseUrl(env)}/rest/v1/automation_rules?${params}`, {
      headers: headers(env)
    });
    if (response.status === 404) return fallbackRule(env, ruleKey);
    if (!response.ok) throw new Error(`rule_read_failed:${response.status}`);
    const rule = (await response.json())[0];
    if (!rule) return fallbackRule(env, ruleKey);
    return isActive(rule) ? rule : null;
  } catch (error) {
    console.error(JSON.stringify({ event: 'automation_rule_fallback', reason: error.message }));
    return fallbackRule(env, ruleKey);
  }
}

export async function resolveAutomationResources(env, rule) {
  const response = await fetch(
    `${baseUrl(env)}/rest/v1/automation_resource_mappings?select=resource_type,resource_key,display_name,external_id&enabled=eq.true`,
    { headers: headers(env) }
  );
  const mappings = response.ok ? await response.json() : [];
  const tags = new Map();
  const groups = new Map();
  for (const mapping of mappings) {
    const target = mapping.resource_type === 'wecom_tag' ? tags : groups;
    target.set(mapping.resource_key, mapping.external_id);
    target.set(mapping.display_name, mapping.external_id);
  }
  const missingTagNames = [];
  const tagIds = [];
  for (const name of rule.tag_names || []) {
    const tagId = tags.get(name);
    if (tagId) tagIds.push(tagId);
    else missingTagNames.push(name);
  }
  if (!tagIds.length && rule.rule_key === SKILL_EMAIL_RULE_KEY && env.WECOM_SKILL_EMAIL_TAG_ID) {
    tagIds.push(env.WECOM_SKILL_EMAIL_TAG_ID);
  }
  if (!tagIds.length && rule.rule_key === ANNUAL_MEMBER_RULE_KEY && env.WECOM_MEMBER_TAG_ID) {
    tagIds.push(env.WECOM_MEMBER_TAG_ID);
  }
  const mappedGroupId = groups.get(rule.group_key) || groups.get(rule.group_name) || '';
  const isWebsitePaidRule = rule.rule_key === SKILL_EMAIL_RULE_KEY || rule.rule_key === ANNUAL_MEMBER_RULE_KEY;
  const groupConfigId = mappedGroupId || (isWebsitePaidRule ? env.WECOM_GROUP_JOIN_CONFIG_ID || '' : '');
  return {
    tagIds: [...new Set(tagIds)],
    missingTagNames,
    groupConfigId,
    missingGroup: Boolean(rule.send_group_invite && !groupConfigId)
  };
}

async function existingAttribution(env, customerKey) {
  const params = new URLSearchParams({
    customer_key: `eq.${customerKey}`,
    select: 'first_touch_at,paid_at',
    limit: '1'
  });
  const response = await fetch(`${baseUrl(env)}/rest/v1/customer_attributions?${params}`, {
    headers: headers(env)
  });
  if (!response.ok) throw new Error(`attribution_read_failed:${response.status}`);
  return (await response.json())[0] || null;
}

export async function upsertCustomerAttribution(env, onboarding, rule, patch = {}) {
  if (!rule.write_attribution) return { skipped: true };
  const now = new Date().toISOString();
  const orderId = patch.order_id ?? onboarding?.stripe_checkout_session_id ?? null;
  const customerKey = patch.customer_key || (orderId ? `order:${orderId}` : '');
  if (!customerKey) throw new Error('missing_customer_attribution_key');
  const existing = await existingAttribution(env, customerKey);
  const firstTouchAt = existing?.first_touch_at || patch.first_touch_at || onboarding?.created_at || now;
  const row = {
    customer_key: customerKey,
    email: patch.email || onboarding?.email || null,
    wecom_external_user_id: patch.wecom_external_user_id || null,
    wecom_user_id: patch.wecom_user_id || rule.wecom_user_id || null,
    rule_key: rule.rule_key,
    source_channel: rule.source_channel,
    customer_type: rule.customer_type,
    stage: patch.stage || 'paid',
    tag_names: rule.tag_names || [],
    order_id: orderId,
    first_touch_at: firstTouchAt,
    paid_at: existing?.paid_at || patch.paid_at || (orderId ? onboarding?.created_at || now : null),
    wecom_added_at: patch.wecom_added_at || null,
    group_invite_sent_at: patch.group_invite_sent_at || null,
    group_joined_at: patch.group_joined_at || null,
    last_event: patch.last_event || '支付成功',
    last_error: patch.last_error || null,
    feishu_synced_at: null,
    updated_at: now
  };
  const response = await fetch(`${baseUrl(env)}/rest/v1/customer_attributions?on_conflict=customer_key`, {
    method: 'POST',
    headers: headers(env, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify(row)
  });
  if (!response.ok) throw new Error(`attribution_upsert_failed:${response.status}:${await response.text()}`);
  return (await response.json())[0] || row;
}

export async function recordAutomationExecution(env, entry) {
  const now = new Date().toISOString();
  const row = {
    execution_id: entry.executionId,
    idempotency_key: entry.idempotencyKey,
    rule_key: entry.ruleKey || null,
    customer_key: entry.customerKey || null,
    source_channel: entry.sourceChannel || null,
    event_type: entry.eventType,
    action: entry.action,
    status: entry.status,
    attempt: entry.attempt || 1,
    duration_ms: entry.durationMs ?? null,
    error_code: entry.errorCode || null,
    error_detail: entry.errorDetail ? String(entry.errorDetail).slice(0, 500) : null,
    original_event_id: entry.originalEventId || null,
    executed_at: entry.executedAt || now,
    next_retry_at: entry.nextRetryAt || null,
    feishu_synced_at: null,
    updated_at: now
  };
  const response = await fetch(`${baseUrl(env)}/rest/v1/automation_execution_logs?on_conflict=idempotency_key`, {
    method: 'POST',
    headers: headers(env, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(row)
  });
  if (!response.ok) throw new Error(`execution_log_write_failed:${response.status}`);
  return { ok: true };
}
