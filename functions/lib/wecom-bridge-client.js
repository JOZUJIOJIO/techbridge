function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function signBridgeRequest(secret, timestamp, body) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)));
}

export async function createContactWayViaBridge(env, state) {
  if (!env.WECOM_BRIDGE_SECRET || !env.WECOM_BRIDGE_URL) {
    throw new Error('missing_wecom_bridge_config');
  }
  const body = JSON.stringify({ state });
  const timestamp = String(Date.now());
  const signature = await signBridgeRequest(env.WECOM_BRIDGE_SECRET, timestamp, body);
  const response = await fetch(`${env.WECOM_BRIDGE_URL.replace(/\/$/, '')}/internal/contact-way`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-techbridge-timestamp': timestamp,
      'x-techbridge-signature': signature
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.config_id || !/^https:\/\//.test(data.qr_code || '')) {
    throw new Error(`wecom_bridge_failed:${response.status}:${data.error || ''}`);
  }
  return data;
}
