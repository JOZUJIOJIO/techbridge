import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commissionForPartner,
  cookieValue,
  createPartnerCookie,
  partnerCookieHeader,
  verifyPartnerCookie
} from '../functions/lib/partner-program.js';
import { onRequestGet } from '../functions/api/partner-referral.js';
import { onRequestGet as onQrRequestGet } from '../functions/api/partner-qr.js';

const secret = 'partner-referral-secret';

test('signs a 30-day partner attribution cookie and rejects tampering', async () => {
  const now = Date.UTC(2026, 7, 28);
  const value = await createPartnerCookie(secret, 'channel-alpha', now);
  assert.equal(await verifyPartnerCookie(secret, value, now + 10_000), 'channel-alpha');
  assert.equal(await verifyPartnerCookie(secret, `${value}0`, now + 10_000), null);
  assert.equal(await verifyPartnerCookie(secret, value, now + 31 * 24 * 60 * 60 * 1000), null);
  const header = partnerCookieHeader(value);
  assert.equal(cookieValue(header), value);
  assert.match(header, /HttpOnly; Secure; SameSite=Lax/);
});

test('allows only the two approved fixed cooperation-income amounts', () => {
  assert.equal(commissionForPartner({ commission_amount: 20_000 }, 66_600), 20_000);
  assert.equal(commissionForPartner({ commission_amount: 40_000 }, 66_600), 40_000);
  assert.equal(commissionForPartner({ commission_amount: 30_000 }, 66_600), 0);
  assert.equal(commissionForPartner({ commission_amount: 40_000 }, 60_000), 0);
});

test('partner referral route validates the partner and sets a signed cookie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /distribution_partners/);
    return Response.json([{
      id: '11111111-1111-4111-8111-111111111111',
      partner_code: 'channel-alpha',
      display_name: '测试渠道',
      partner_tier: 'standard',
      commission_amount: 20_000,
      payout_delay_days: 8,
      payout_method: 'manual'
    }]);
  };
  try {
    const response = await onRequestGet({
      request: new Request('https://qiaobit.com/s/channel-alpha'),
      env: {
        PARTNER_REFERRAL_SECRET: secret,
        PUBLIC_SITE_URL: 'https://qiaobit.com',
        SUPABASE_URL: 'https://supabase.example.com',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role'
      },
      partnerCode: 'channel-alpha'
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://qiaobit.com/skill-letter?partner=channel-alpha');
    assert.match(response.headers.get('set-cookie'), /tb_partner=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generates a dedicated SVG QR code for an active partner link', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([{
    id: '11111111-1111-4111-8111-111111111111',
    partner_code: 'channel-alpha',
    display_name: '测试渠道',
    partner_tier: 'standard',
    commission_amount: 20_000,
    payout_delay_days: 8,
    payout_method: 'manual'
  }]);
  try {
    const response = await onQrRequestGet({
      request: new Request('https://qiaobit.com/api/partner-qr?code=channel-alpha'),
      env: {
        PUBLIC_SITE_URL: 'https://qiaobit.com',
        SUPABASE_URL: 'https://supabase.example.com',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role'
      }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await response.text(), /<svg/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
