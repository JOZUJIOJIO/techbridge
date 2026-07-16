import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import {
  loadAutomationRule,
  recordAutomationExecution,
  resolveAutomationResources,
  upsertCustomerAttribution
} from './automation.mjs';
import {
  createContactWay,
  decryptMessage,
  getGroupJoinWay,
  markTags,
  parseEventXml,
  sendMemberWelcome,
  verifySignature,
  xmlField
} from './wecom.js';

const host = process.env.WECOM_BRIDGE_HOST || '127.0.0.1';
const port = Number(process.env.WECOM_BRIDGE_PORT || 8791);
const corpId = process.env.WECOM_CORP_ID || '';
const contactUserId = process.env.WECOM_CONTACT_USER_ID || '';
const secretDirectory = '/etc/techbridge-wecom';

function readSecret(name, optional = false) {
  try {
    return readFileSync(`${secretDirectory}/${name}`, 'utf8').trim();
  } catch (error) {
    if (optional && error.code === 'ENOENT') return '';
    throw error;
  }
}

function callbackConfig() {
  const token = readSecret('callback-token');
  const aesKey = readSecret('encoding-aes-key');
  if (!corpId || !token || aesKey.length !== 43) throw new Error('invalid_callback_config');
  return { token, aesKey };
}

function integrationConfig() {
  const env = {
    WECOM_CORP_ID: corpId,
    WECOM_CONTACT_USER_ID: contactUserId,
    WECOM_CUSTOMER_SECRET: readSecret('customer-secret'),
    WECOM_GROUP_JOIN_CONFIG_ID: readSecret('group-join-config-id', true),
    WECOM_MEMBER_TAG_ID: readSecret('member-tag-id', true),
    SUPABASE_URL: readSecret('supabase-url'),
    SUPABASE_SERVICE_ROLE_KEY: readSecret('supabase-service-role-key')
  };
  if (Object.values(env).some((value) => !value)) throw new Error('invalid_integration_config');
  return env;
}

function textReply(response, status, body) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(body);
}

function jsonReply(response, status, data) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(data));
}

async function readBody(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyInternalRequest(request, body) {
  const timestamp = request.headers['x-techbridge-timestamp'] || '';
  const supplied = request.headers['x-techbridge-signature'] || '';
  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > 5 * 60 * 1000) {
    return false;
  }
  const expected = createHmac('sha256', readSecret('bridge-shared-secret'))
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return secureEqual(expected, supplied);
}

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json'
  };
}

async function findOnboarding(env, state) {
  if (!/^m_[a-f0-9]{26}$/.test(state)) return null;
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const params = new URLSearchParams({
    state_token: `eq.${state}`,
    select: 'stripe_checkout_session_id,email,state_token,status,automation_rule_key,welcome_sent_at,tag_applied_at,group_invite_sent_at,created_at'
  });
  const response = await fetch(`${base}/rest/v1/member_wecom_onboarding?${params}`, {
    headers: supabaseHeaders(env)
  });
  if (!response.ok) throw new Error(`supabase_lookup_failed:${response.status}`);
  return (await response.json())[0] || null;
}

async function updateOnboarding(env, state, patch) {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(
    `${base}/rest/v1/member_wecom_onboarding?state_token=eq.${encodeURIComponent(state)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(env),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
    }
  );
  if (!response.ok) throw new Error(`supabase_update_failed:${response.status}`);
}

async function handleExternalContactAdded(env, event) {
  if (!event.state || !event.externalUserId || !event.userId) return { ignored: true };
  const onboarding = await findOnboarding(env, event.state);
  if (!onboarding) return { ignored: true };
  const rule = await loadAutomationRule(
    env,
    onboarding.automation_rule_key || 'website_stripe_annual_199'
  );
  if (!rule) {
    console.log(JSON.stringify({ event: 'automation_rule_disabled', state: event.state }));
    return { ignored: true, reason: 'rule_disabled' };
  }
  const executionId = `wecom:${event.state}`;
  const customerKey = `order:${onboarding.stripe_checkout_session_id}`;
  const startedAt = Date.now();

  await updateOnboarding(env, event.state, {
    status: 'wecom_added',
    wecom_external_user_id: event.externalUserId,
    wecom_user_id: event.userId,
    wecom_added_at: new Date().toISOString(),
    last_error: null
  });

  await upsertCustomerAttribution(env, onboarding, rule, {
    stage: 'wecom_added',
    wecom_external_user_id: event.externalUserId,
    wecom_user_id: event.userId,
    wecom_added_at: new Date().toISOString(),
    last_event: '添加企微'
  });

  const resources = await resolveAutomationResources(env, rule);
  const errors = [];
  let groupJoinWay = null;
  let welcomeSent = Boolean(onboarding.welcome_sent_at);
  let tagApplied = Boolean(onboarding.tag_applied_at);

  if (rule.send_group_invite && resources.groupConfigId) {
    try {
      groupJoinWay = await getGroupJoinWay(env, resources.groupConfigId);
    } catch (error) {
      errors.push(`group_join_way:${error.message}`);
    }
  }

  if (!welcomeSent && !errors.some((message) => message.startsWith('group_join_way:'))) {
    const actionStartedAt = Date.now();
    try {
      const welcome = await sendMemberWelcome(env, event, groupJoinWay, {
        welcomeMessage: rule.welcome_message,
        groupName: rule.group_name
      });
      welcomeSent = !welcome?.skipped;
      await recordAutomationExecution(env, {
        executionId,
        idempotencyKey: `${event.state}:welcome`,
        ruleKey: rule.rule_key,
        customerKey,
        sourceChannel: rule.source_channel,
        eventType: '发送欢迎语',
        action: '发送欢迎语及群入口',
        status: welcome?.skipped ? 'skipped' : 'success',
        durationMs: Date.now() - actionStartedAt,
        originalEventId: event.state
      });
    } catch (error) {
      errors.push(`welcome:${error.message}`);
      await recordAutomationExecution(env, {
        executionId,
        idempotencyKey: `${event.state}:welcome`,
        ruleKey: rule.rule_key,
        customerKey,
        sourceChannel: rule.source_channel,
        eventType: '发送欢迎语',
        action: '发送欢迎语及群入口',
        status: 'failed',
        durationMs: Date.now() - actionStartedAt,
        errorCode: 'wecom_welcome_failed',
        errorDetail: error.message,
        originalEventId: event.state
      });
    }
  }

  if (!tagApplied) {
    const actionStartedAt = Date.now();
    try {
      const tag = await markTags(env, event, resources.tagIds);
      tagApplied = !tag?.skipped;
      await recordAutomationExecution(env, {
        executionId,
        idempotencyKey: `${event.state}:tag`,
        ruleKey: rule.rule_key,
        customerKey,
        sourceChannel: rule.source_channel,
        eventType: '打标签',
        action: `添加标签：${(rule.tag_names || []).join('、')}`,
        status: tag?.skipped ? 'skipped' : 'success',
        durationMs: Date.now() - actionStartedAt,
        originalEventId: event.state
      });
    } catch (error) {
      errors.push(`tag:${error.message}`);
      await recordAutomationExecution(env, {
        executionId,
        idempotencyKey: `${event.state}:tag`,
        ruleKey: rule.rule_key,
        customerKey,
        sourceChannel: rule.source_channel,
        eventType: '打标签',
        action: `添加标签：${(rule.tag_names || []).join('、')}`,
        status: 'failed',
        durationMs: Date.now() - actionStartedAt,
        errorCode: 'wecom_tag_failed',
        errorDetail: error.message,
        originalEventId: event.state
      });
    }
  }

  const groupInviteSent = Boolean(groupJoinWay?.qr_code && welcomeSent);
  await updateOnboarding(env, event.state, {
    status: groupInviteSent ? 'group_invite_sent' : 'wecom_added',
    welcome_sent_at: welcomeSent ? onboarding.welcome_sent_at || new Date().toISOString() : null,
    tag_applied_at: tagApplied ? onboarding.tag_applied_at || new Date().toISOString() : null,
    group_invite_sent_at: groupInviteSent ? onboarding.group_invite_sent_at || new Date().toISOString() : null,
    last_error: errors.length ? errors.join(';').slice(0, 1000) : null
  });

  await upsertCustomerAttribution(env, onboarding, rule, {
    stage: groupInviteSent ? 'group_invite_sent' : 'wecom_added',
    wecom_external_user_id: event.externalUserId,
    wecom_user_id: event.userId,
    wecom_added_at: new Date().toISOString(),
    group_invite_sent_at: groupInviteSent ? new Date().toISOString() : null,
    last_event: groupInviteSent ? '已发群入口' : '已加企微',
    last_error: errors.join(';').slice(0, 1000) || null
  });

  await recordAutomationExecution(env, {
    executionId,
    idempotencyKey: `${event.state}:complete`,
    ruleKey: rule.rule_key,
    customerKey,
    sourceChannel: rule.source_channel,
    eventType: '添加企微',
    action: '会员私域激活流程',
    status: errors.length ? 'partial' : 'success',
    durationMs: Date.now() - startedAt,
    errorCode: errors.length ? 'partial_failure' : null,
    errorDetail: errors.join(';'),
    originalEventId: event.state
  });

  if (errors.length) throw new Error(`automation_partial_failure:${errors.join(';')}`);
  return { ok: true };
}

async function processEvent(env, message) {
  const event = parseEventXml(message);
  console.log(JSON.stringify({
    event: 'wecom_event_received',
    eventType: event.event || 'message',
    changeType: event.changeType || ''
  }));
  if (event.event === 'change_external_contact' && event.changeType === 'add_external_contact') {
    return handleExternalContactAdded(env, event);
  }
  return { ignored: true };
}

function callbackSignature(url, encrypted, token) {
  return verifySignature({
    token,
    timestamp: url.searchParams.get('timestamp') || '',
    nonce: url.searchParams.get('nonce') || '',
    encrypted,
    signature: url.searchParams.get('msg_signature') || ''
  });
}

async function handleCallback(request, response, url) {
  const { token, aesKey } = callbackConfig();
  if (request.method === 'GET') {
    const echo = url.searchParams.get('echostr') || '';
    if (!callbackSignature(url, echo, token)) return textReply(response, 403, 'invalid signature');
    try {
      return textReply(response, 200, decryptMessage(echo, aesKey, corpId));
    } catch (error) {
      console.error(JSON.stringify({ event: 'callback_verify_failed', reason: error.message }));
      return textReply(response, 400, 'invalid payload');
    }
  }

  if (request.method !== 'POST') return textReply(response, 405, 'method not allowed');
  try {
    const body = await readBody(request);
    const encrypted = xmlField(body, 'Encrypt');
    if (!callbackSignature(url, encrypted, token)) return textReply(response, 403, 'invalid signature');
    const message = decryptMessage(encrypted, aesKey, corpId);
    await processEvent(integrationConfig(), message);
    return textReply(response, 200, 'success');
  } catch (error) {
    console.error(JSON.stringify({ event: 'callback_processing_failed', reason: error.message }));
    return textReply(response, 500, 'processing failed');
  }
}

async function handleContactWay(request, response) {
  if (request.method !== 'POST') return jsonReply(response, 405, { error: 'method_not_allowed' });
  const body = await readBody(request, 16 * 1024);
  if (!verifyInternalRequest(request, body)) return jsonReply(response, 403, { error: 'forbidden' });

  try {
    const { state } = JSON.parse(body);
    if (!/^m_[a-f0-9]{26}$/.test(state)) return jsonReply(response, 400, { error: 'invalid_state' });
    const contactWay = await createContactWay(integrationConfig(), state);
    return jsonReply(response, 200, {
      config_id: contactWay.config_id,
      qr_code: contactWay.qr_code
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'contact_way_failed', reason: error.message }));
    return jsonReply(response, 502, { error: 'contact_way_failed' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || host}`);
  try {
    if (url.pathname === '/healthz') return textReply(response, 200, 'ok');
    if (url.pathname === '/wecom/callback') return handleCallback(request, response, url);
    if (url.pathname === '/internal/contact-way') return handleContactWay(request, response);
    return textReply(response, 404, 'not found');
  } catch (error) {
    console.error(JSON.stringify({ event: 'bridge_error', reason: error.message }));
    return textReply(response, 500, 'server error');
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ event: 'bridge_started', host, port }));
});
