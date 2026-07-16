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

export function defaultMemberRule(env) {
  return {
    rule_key: 'website_stripe_annual_199',
    name: '官网¥199年度会员',
    enabled: true,
    source_channel: 'Tech Bridge官网',
    customer_type: '付费会员',
    wecom_user_id: env.WECOM_CONTACT_USER_ID,
    tag_names: ['官网来源', '199元付费会员'],
    welcome_message: '欢迎加入 Tech Bridge 会员。你的付款与会员资格已经自动核验。请点击下方入口，长按识别二维码加入会员群。',
    group_key: 'member-core',
    group_name: '比特自媒体核心群',
    send_group_invite: true,
    notify_feishu: true,
    write_attribution: true,
    fallback: true
  };
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
    if (response.status === 404) return defaultMemberRule(env);
    if (!response.ok) throw new Error(`rule_read_failed:${response.status}`);
    const rule = (await response.json())[0];
    if (!rule) return defaultMemberRule(env);
    return isActive(rule) ? rule : null;
  } catch (error) {
    console.error(JSON.stringify({ event: 'automation_rule_fallback', reason: error.message }));
    return defaultMemberRule(env);
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
  const tagIds = (rule.tag_names || []).map((name) => tags.get(name)).filter(Boolean);
  if (!tagIds.length && env.WECOM_MEMBER_TAG_ID) tagIds.push(env.WECOM_MEMBER_TAG_ID);
  const groupConfigId = groups.get(rule.group_key) || groups.get(rule.group_name) || env.WECOM_GROUP_JOIN_CONFIG_ID || '';
  return { tagIds: [...new Set(tagIds)], groupConfigId };
}

export async function upsertCustomerAttribution(env, onboarding, rule, patch = {}) {
  if (!rule.write_attribution) return { skipped: true };
  const now = new Date().toISOString();
  const orderId = onboarding.stripe_checkout_session_id;
  const row = {
    customer_key: `order:${orderId}`,
    email: onboarding.email || null,
    wecom_external_user_id: patch.wecom_external_user_id || null,
    wecom_user_id: patch.wecom_user_id || rule.wecom_user_id || null,
    rule_key: rule.rule_key,
    source_channel: rule.source_channel,
    customer_type: rule.customer_type,
    stage: patch.stage || 'paid',
    tag_names: rule.tag_names || [],
    order_id: orderId,
    first_touch_at: onboarding.created_at || now,
    paid_at: onboarding.created_at || now,
    wecom_added_at: patch.wecom_added_at || null,
    group_invite_sent_at: patch.group_invite_sent_at || null,
    group_joined_at: patch.group_joined_at || null,
    last_event: patch.last_event || '支付成功',
    last_error: patch.last_error || null,
    feishu_synced_at: null,
    updated_at: now
  };
  const response = await fetch(`${baseUrl(env)}/rest/v1/customer_attributions?on_conflict=order_id`, {
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
