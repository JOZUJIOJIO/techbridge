async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function distributionAdminAuthorized(env, request) {
  const supplied = String(request.headers.get('x-distribution-admin') || '');
  if (!env.DISTRIBUTION_ADMIN_SECRET || supplied.length < 24) return false;
  return constantTimeEqual(await sha256(supplied), await sha256(env.DISTRIBUTION_ADMIN_SECRET));
}
