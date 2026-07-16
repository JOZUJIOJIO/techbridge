import { createDecipheriv, createHash } from 'node:crypto';

let tokenCache = null;

function requireConfig(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new Error(`missing_wecom_config:${missing.join(',')}`);
}

function decodeAesKey(value) {
  const key = Buffer.from(`${String(value || '')}=`, 'base64');
  if (key.length !== 32) throw new Error('invalid_wecom_encoding_aes_key');
  return key;
}

function removePkcs7(buffer) {
  if (!buffer.length) throw new Error('empty_wecom_payload');
  const padding = buffer[buffer.length - 1];
  if (padding < 1 || padding > 32 || padding > buffer.length) {
    throw new Error('invalid_wecom_padding');
  }
  for (let i = buffer.length - padding; i < buffer.length; i += 1) {
    if (buffer[i] !== padding) throw new Error('invalid_wecom_padding');
  }
  return buffer.subarray(0, buffer.length - padding);
}

export function signatureFor(token, timestamp, nonce, encrypted) {
  return createHash('sha1')
    .update([token, timestamp, nonce, encrypted].map(String).sort().join(''))
    .digest('hex');
}

export function verifySignature({ token, timestamp, nonce, encrypted, signature }) {
  if (!token || !timestamp || !nonce || !encrypted || !signature) return false;
  const expected = signatureFor(token, timestamp, nonce, encrypted);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export function decryptMessage(encrypted, encodingAesKey, expectedReceiverId) {
  const key = decodeAesKey(encodingAesKey);
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const decrypted = removePkcs7(Buffer.concat([
    decipher.update(Buffer.from(String(encrypted || ''), 'base64')),
    decipher.final()
  ]));

  if (decrypted.length < 20) throw new Error('invalid_wecom_payload');
  const messageLength = decrypted.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageEnd > decrypted.length) throw new Error('invalid_wecom_message_length');

  const message = decrypted.subarray(20, messageEnd).toString('utf8');
  const receiverId = decrypted.subarray(messageEnd).toString('utf8');
  if (expectedReceiverId && receiverId !== expectedReceiverId) {
    throw new Error('invalid_wecom_receiver');
  }
  return message;
}

export function xmlField(xml, name) {
  const escapedName = String(name).replace(/[^A-Za-z0-9_]/g, '');
  const match = String(xml || '').match(
    new RegExp(`<${escapedName}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${escapedName}>`)
  );
  return match ? String(match[1] ?? match[2] ?? '').trim() : '';
}

export function parseEventXml(xml) {
  return {
    event: xmlField(xml, 'Event'),
    changeType: xmlField(xml, 'ChangeType'),
    userId: xmlField(xml, 'UserID'),
    externalUserId: xmlField(xml, 'ExternalUserID'),
    state: xmlField(xml, 'State'),
    welcomeCode: xmlField(xml, 'WelcomeCode'),
    chatId: xmlField(xml, 'ChatId')
  };
}

export async function getAccessToken(env) {
  requireConfig(env, ['WECOM_CORP_ID', 'WECOM_CUSTOMER_SECRET']);
  const cacheKey = `${env.WECOM_CORP_ID}:${env.WECOM_CUSTOMER_SECRET}`;
  if (tokenCache && tokenCache.key === cacheKey && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value;
  }

  const params = new URLSearchParams({
    corpid: env.WECOM_CORP_ID,
    corpsecret: env.WECOM_CUSTOMER_SECRET
  });
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?${params}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode !== 0 || !data.access_token) {
    throw new Error(`wecom_token_failed:${data.errcode || response.status}:${data.errmsg || ''}`);
  }

  tokenCache = {
    key: cacheKey,
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 7200) * 1000
  };
  return tokenCache.value;
}

async function wecomPost(env, path, payload) {
  const accessToken = await getAccessToken(env);
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/${path}?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode !== 0) {
    throw new Error(`wecom_api_failed:${path}:${data.errcode || response.status}:${data.errmsg || ''}`);
  }
  return data;
}

export async function createContactWay(env, state) {
  requireConfig(env, ['WECOM_CONTACT_USER_ID']);
  return wecomPost(env, 'externalcontact/add_contact_way', {
    type: 1,
    scene: 2,
    style: 1,
    remark: 'Tech Bridge 会员激活',
    skip_verify: true,
    state,
    user: [env.WECOM_CONTACT_USER_ID]
  });
}

export async function getGroupJoinWay(env, configId = env.WECOM_GROUP_JOIN_CONFIG_ID) {
  if (!configId) return null;
  const data = await wecomPost(env, 'externalcontact/groupchat/get_join_way', {
    config_id: configId
  });
  return data.join_way || null;
}

export async function markTags(env, event, tagIds = []) {
  const resolvedTagIds = [...new Set(tagIds.filter(Boolean))];
  if (!resolvedTagIds.length) return { skipped: true };
  return wecomPost(env, 'externalcontact/mark_tag', {
    userid: event.userId,
    external_userid: event.externalUserId,
    add_tag: resolvedTagIds
  });
}

export async function markMemberTag(env, event) {
  return markTags(env, event, env.WECOM_MEMBER_TAG_ID ? [env.WECOM_MEMBER_TAG_ID] : []);
}

export async function sendMemberWelcome(env, event, groupJoinWay, options = {}) {
  if (!event.welcomeCode) return { skipped: true };
  const groupQr = groupJoinWay?.qr_code || '';
  const groupName = options.groupName || 'Tech Bridge 会员群';
  const welcomeMessage = options.welcomeMessage || (
    groupQr
      ? '欢迎加入 Tech Bridge 会员。你的付款与会员资格已经自动核验。请点击下方入口，长按识别二维码加入会员群。'
      : '欢迎加入 Tech Bridge 会员。你的付款与会员资格已经自动核验，会员信会发送到付款邮箱。会员群入口将在配置完成后发送。'
  );
  const payload = {
    welcome_code: event.welcomeCode,
    text: {
      content: welcomeMessage
    }
  };

  if (groupQr) {
    payload.attachments = [{
      msgtype: 'link',
      link: {
        title: `加入${groupName}`,
        picurl: groupQr,
        desc: `点击后长按识别二维码加入${groupName}`,
        url: groupQr
      }
    }];
  }
  return wecomPost(env, 'externalcontact/send_welcome_msg', payload);
}
