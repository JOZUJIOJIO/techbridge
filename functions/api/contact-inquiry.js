const MAX_BODY_BYTES = 16 * 1024;

const ALLOWED = {
  cooperationType: new Set(['ai_consulting', 'brand_content', 'ai_product', 'smart_hardware']),
  budget: new Set(['under_10k', '10k_50k', '50k_200k', 'over_200k', 'to_assess']),
  timeline: new Set(['within_2_weeks', 'within_1_month', 'within_3_months', 'after_3_months', 'to_assess'])
};

const TYPE_LABELS = {
  ai_consulting: 'AI 培训与咨询',
  brand_content: '品牌内容合作',
  ai_product: 'AI 产品落地',
  smart_hardware: '智能硬件'
};

const BUDGET_LABELS = {
  under_10k: '1 万以内',
  '10k_50k': '1–5 万',
  '50k_200k': '5–20 万',
  over_200k: '20 万以上',
  to_assess: '需要共同评估'
};

const TIMELINE_LABELS = {
  within_2_weeks: '2 周内',
  within_1_month: '1 个月内',
  within_3_months: '1–3 个月',
  after_3_months: '3 个月以后',
  to_assess: '先评估，不着急启动'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function clean(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validate(payload) {
  const inquiry = {
    cooperation_type: clean(payload.cooperationType, 40),
    contact_name: clean(payload.contactName, 60),
    company: clean(payload.company, 100) || null,
    contact_method: clean(payload.contactMethod, 120),
    budget: clean(payload.budget, 40),
    timeline: clean(payload.timeline, 40),
    need: clean(payload.need, 1200),
    source: clean(payload.source, 80) || 'qiaobit-homepage'
  };

  if (!ALLOWED.cooperationType.has(inquiry.cooperation_type)) return { error: '请选择合作类型。' };
  if (!inquiry.contact_name) return { error: '请填写姓名。' };
  if (!inquiry.contact_method) return { error: '请填写联系方式。' };
  if (!ALLOWED.budget.has(inquiry.budget)) return { error: '请选择预算范围。' };
  if (!ALLOWED.timeline.has(inquiry.timeline)) return { error: '请选择启动时间。' };
  if (inquiry.need.length < 12) return { error: '请至少用 12 个字说明需要解决的问题。' };
  return { inquiry };
}

async function getFeishuTenantToken(env) {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    throw new Error('missing_feishu_config');
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    console.error(JSON.stringify({
      event: 'feishu_token_failed',
      status: response.status,
      code: data.code,
      message: String(data.msg || '').slice(0, 300)
    }));
    throw new Error('feishu_token_failed');
  }
  return data.tenant_access_token;
}

function toFeishuFields(inquiry) {
  const type = TYPE_LABELS[inquiry.cooperation_type];
  return {
    '申请主题': `${type}｜${inquiry.company || inquiry.contact_name}`,
    '合作类型': type,
    '姓名': inquiry.contact_name,
    '公司 / 团队': inquiry.company || '',
    '联系方式': inquiry.contact_method,
    '预算范围': BUDGET_LABELS[inquiry.budget],
    '期望启动时间': TIMELINE_LABELS[inquiry.timeline],
    '需求描述': inquiry.need,
    '跟进状态': '新申请',
    '来源': inquiry.source === 'qiaobit-homepage' ? 'Tech Bridge 官网' : inquiry.source
  };
}

async function saveInquiryToFeishu(env, inquiry) {
  if (!env.FEISHU_BASE_TOKEN || !env.FEISHU_TABLE_ID) {
    throw new Error('missing_feishu_config');
  }

  const tenantToken = await getFeishuTenantToken(env);
  const baseToken = encodeURIComponent(env.FEISHU_BASE_TOKEN);
  const tableId = encodeURIComponent(env.FEISHU_TABLE_ID);
  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tenantToken}`,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ fields: toFeishuFields(inquiry) })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0) {
    console.error(JSON.stringify({
      event: 'contact_inquiry_feishu_write_failed',
      status: response.status,
      code: data.code,
      message: String(data.msg || '').slice(0, 300)
    }));
    throw new Error('feishu_write_failed');
  }

  return {
    recordId: data.data?.record?.record_id,
    tenantToken
  };
}

async function sendFeishuNotification(env, tenantToken, inquiry, recordId) {
  if (!env.FEISHU_NOTIFY_OPEN_ID) {
    console.error(JSON.stringify({ event: 'contact_inquiry_notification_skipped', reason: 'missing_notify_open_id', recordId }));
    return false;
  }

  const messageLines = [
    '【Tech Bridge 新合作申请】',
    '',
    `合作类型：${TYPE_LABELS[inquiry.cooperation_type]}`,
    `申请人：${inquiry.contact_name}`,
    `公司 / 团队：${inquiry.company || '未填写'}`,
    `联系方式：${inquiry.contact_method}`,
    `预算范围：${BUDGET_LABELS[inquiry.budget]}`,
    `启动时间：${TIMELINE_LABELS[inquiry.timeline]}`,
    '',
    `需求：${inquiry.need.slice(0, 360)}`
  ];
  if (env.FEISHU_BASE_URL) messageLines.push('', `查看多维表格：${env.FEISHU_BASE_URL}`);

  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tenantToken}`,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      receive_id: env.FEISHU_NOTIFY_OPEN_ID,
      msg_type: 'text',
      content: JSON.stringify({ text: messageLines.join('\n') })
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0) {
    console.error(JSON.stringify({
      event: 'contact_inquiry_notification_failed',
      status: response.status,
      code: data.code,
      message: String(data.msg || '').slice(0, 300),
      recordId
    }));
    return false;
  }
  return true;
}

export async function onRequestPost({ request, env }) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large', message: '提交内容过长。' }, 413);
  }

  let payload;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large', message: '提交内容过长。' }, 413);
    }
    payload = JSON.parse(body);
  } catch {
    return json({ error: 'bad_request', message: '请求内容无效。' }, 400);
  }

  if (clean(payload.website, 200)) {
    return json({ success: true }, 201);
  }

  const result = validate(payload);
  if (result.error) return json({ error: 'validation_failed', message: result.error }, 400);

  try {
    const saved = await saveInquiryToFeishu(env, result.inquiry);
    const notificationSent = await sendFeishuNotification(env, saved.tenantToken, result.inquiry, saved.recordId);
    console.log(JSON.stringify({
      event: 'contact_inquiry_created',
      destination: 'feishu_base',
      recordId: saved.recordId,
      notificationSent
    }));
    return json({ success: true, recordId: saved.recordId, notificationSent }, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: 'contact_inquiry_failed', reason: error.message }));
    const missingConfig = error.message === 'missing_feishu_config';
    return json({
      error: missingConfig ? 'missing_config' : 'submission_failed',
      message: missingConfig ? '飞书合作申请服务尚未配置完成。' : '提交失败，请稍后重试。'
    }, missingConfig ? 503 : 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
