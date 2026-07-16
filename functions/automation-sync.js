const TRIGGER_EVENT_MAP = {
  '支付成功': 'payment_succeeded',
  '添加企微': 'wecom_contact_added',
  '官网表单': 'website_form_submitted',
  '小程序进入': 'miniapp_opened',
  '线下活动': 'offline_event',
  '手工导入': 'manual_import'
};

const STAGE_LABELS = {
  new_lead: '新线索',
  paid: '已付款',
  wecom_added: '已加企微',
  group_invite_sent: '已发群入口',
  group_joined: '已入群',
  lost: '已流失'
};

const STATUS_LABELS = {
  pending: '等待执行',
  running: '执行中',
  success: '成功',
  partial: '部分成功',
  failed: '失败',
  skipped: '已跳过'
};

function first(value) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function stringArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value ? [String(value)] : [];
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function epochMillis(value) {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
}

function requireConfig(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length) throw new Error(`missing_automation_sync_config:${missing.join(',')}`);
}

function supabaseHeaders(env, prefer) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {})
  };
}

async function feishuToken(env) {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`feishu_token_failed:${data.code || response.status}`);
  }
  return data.tenant_access_token;
}

async function listFeishuRecords(env, token, tableId) {
  const records = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ page_size: '500' });
    if (pageToken) params.set('page_token', pageToken);
    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(env.FEISHU_AUTOMATION_BASE_TOKEN)}/tables/${encodeURIComponent(tableId)}/records?${params}`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.code !== 0) {
      throw new Error(`feishu_record_list_failed:${tableId}:${data.code || response.status}`);
    }
    records.push(...(data.data?.items || []));
    pageToken = data.data?.has_more ? data.data?.page_token || '' : '';
  } while (pageToken);
  return records;
}

export function mapFeishuRule(record) {
  const fields = record.fields || {};
  const ruleKey = String(fields['规则Key'] || '').trim();
  if (!ruleKey) return null;
  return {
    rule_key: ruleKey,
    name: String(fields['规则名称'] || ruleKey),
    enabled: fields['启用'] === true,
    priority: Number(fields['优先级'] || 0),
    trigger_event: TRIGGER_EVENT_MAP[first(fields['触发场景'])] || String(first(fields['触发场景']) || 'unknown'),
    source_channel: String(first(fields['渠道来源']) || '未知'),
    customer_type: String(first(fields['客户类型']) || '未知'),
    wecom_user_id: String(fields['企微员工UserID'] || ''),
    tag_names: stringArray(fields['自动标签']),
    welcome_message: String(fields['欢迎语'] || ''),
    group_key: String(fields['群配置ID'] || ''),
    group_name: String(fields['群名称'] || ''),
    send_group_invite: fields['发送群入口'] === true,
    notify_feishu: fields['通知飞书'] === true,
    write_attribution: fields['写入客户归因'] !== false,
    version: Number(fields['规则版本'] || 1),
    valid_from: isoDate(fields['有效开始']),
    valid_until: isoDate(fields['有效结束']),
    source_system: 'feishu',
    source_record_id: record.record_id,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function syncRules(env, token) {
  const records = await listFeishuRecords(env, token, env.FEISHU_AUTOMATION_RULES_TABLE_ID);
  const rules = records.map(mapFeishuRule).filter(Boolean);
  if (!rules.length) return { read: records.length, upserted: 0 };
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/automation_rules?on_conflict=rule_key`, {
    method: 'POST',
    headers: supabaseHeaders(env, 'resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(rules)
  });
  if (!response.ok) throw new Error(`automation_rule_upsert_failed:${response.status}:${await response.text()}`);
  return { read: records.length, upserted: rules.length };
}

async function writeFeishuRecord(env, token, tableId, fields, recordId) {
  const baseUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(env.FEISHU_AUTOMATION_BASE_TOKEN)}/tables/${encodeURIComponent(tableId)}/records`;
  const response = await fetch(recordId ? `${baseUrl}/${encodeURIComponent(recordId)}` : baseUrl, {
    method: recordId ? 'PUT' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ fields })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0) {
    throw new Error(`feishu_record_write_failed:${tableId}:${data.code || response.status}`);
  }
  return data.data?.record?.record_id || recordId || '';
}

async function patchSupabaseRow(env, table, id, patch) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env, 'return=minimal'),
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error(`supabase_sync_mark_failed:${table}:${response.status}`);
}

function attributionFields(row) {
  return compact({
    '客户标识': row.customer_key,
    '客户姓名': row.customer_name || '',
    '邮箱': row.email || '',
    '企微ExternalUserID': row.wecom_external_user_id || '',
    '企微员工UserID': row.wecom_user_id || '',
    '命中规则': row.rule_key || '',
    '规则Key': row.rule_key || '',
    '渠道来源': row.source_channel || '人工录入',
    '客户类型': row.customer_type || '内容线索',
    '当前阶段': STAGE_LABELS[row.stage] || '新线索',
    '客户标签': row.tag_names || [],
    '订单号': row.order_id || '',
    '付款金额': Number.isFinite(Number(row.amount_total)) ? Number(row.amount_total) / 100 : undefined,
    '首次触达时间': epochMillis(row.first_touch_at),
    '付款时间': epochMillis(row.paid_at),
    '添加企微时间': epochMillis(row.wecom_added_at),
    '发送群入口时间': epochMillis(row.group_invite_sent_at),
    '入群时间': epochMillis(row.group_joined_at),
    '最后事件': row.last_event || '',
    '跟进备注': row.last_error || ''
  });
}

function executionLogFields(row) {
  return compact({
    '执行ID': row.execution_id,
    '幂等键': row.idempotency_key,
    '规则Key': row.rule_key || '',
    '客户标识': row.customer_key || '',
    '渠道来源': row.source_channel || '',
    '事件类型': row.event_type || '添加企微',
    '执行动作': row.action,
    '执行状态': STATUS_LABELS[row.status] || '失败',
    '尝试次数': Number(row.attempt || 1),
    '耗时毫秒': Number(row.duration_ms || 0),
    '错误代码': row.error_code || '',
    '错误详情': row.error_detail || '',
    '原始事件ID': row.original_event_id || '',
    '执行时间': epochMillis(row.executed_at),
    '下次重试时间': epochMillis(row.next_retry_at)
  });
}

async function exportRows(env, token, config) {
  if (!config.tableId) return { skipped: true, exported: 0, failed: 0 };
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const params = new URLSearchParams({
    select: '*',
    feishu_synced_at: 'is.null',
    order: 'created_at.asc',
    limit: '100'
  });
  const response = await fetch(`${base}/rest/v1/${config.supabaseTable}?${params}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`supabase_export_read_failed:${config.supabaseTable}:${response.status}`);
  const rows = await response.json();
  let exported = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const recordId = await writeFeishuRecord(env, token, config.tableId, config.map(row), row.feishu_record_id);
      await patchSupabaseRow(env, config.supabaseTable, row.id, {
        feishu_record_id: recordId,
        feishu_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      exported += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ event: 'automation_export_failed', table: config.supabaseTable, reason: error.message }));
    }
  }
  return { exported, failed };
}

export async function runAutomationSync(env) {
  requireConfig(env, [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'FEISHU_AUTOMATION_BASE_TOKEN',
    'FEISHU_AUTOMATION_RULES_TABLE_ID',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]);
  const token = await feishuToken(env);
  const rules = await syncRules(env, token);
  const customers = await exportRows(env, token, {
    supabaseTable: 'customer_attributions',
    tableId: env.FEISHU_CUSTOMER_ATTRIBUTION_TABLE_ID,
    map: attributionFields
  });
  const logs = await exportRows(env, token, {
    supabaseTable: 'automation_execution_logs',
    tableId: env.FEISHU_AUTOMATION_LOG_TABLE_ID,
    map: executionLogFields
  });
  const result = { rules, customers, logs };
  console.log(JSON.stringify({ event: 'automation_sync_completed', ...result }));
  return result;
}
