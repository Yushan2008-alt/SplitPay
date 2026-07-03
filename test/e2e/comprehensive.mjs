/**
 * Comprehensive E2E test runner — runs against http://localhost:3001
 * Usage: node test/e2e/comprehensive.mjs
 */

import { createHmac } from 'crypto';

const BASE = 'http://localhost:3001/api/v1';

// ── Helpers ────────────────────────────────────────────────────────────────
function hmacSign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function generateSignedToken(payload, secret, expiresInSeconds) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const data = JSON.stringify({ ...payload, expiresAt });
  const encoded = Buffer.from(data).toString('base64url');
  const sig = hmacSign(encoded, secret);
  return `${encoded}.${sig}`;
}

async function api(method, path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  let data = null;
  try { data = isJson ? await res.json() : null; } catch { data = null; }

  return { status: res.status, headers: res.headers, body: data };
}

const SIGNED_URL_SECRET = '3333333333333333333333333333333333333333333333333333333333333333';

// ── State ──────────────────────────────────────────────────────────────────
let hostEmail, memberEmail, inviteEmail;
let hostToken, hostRefresh, memberToken, memberRefresh;
let hostOtp, memberOtp;
let groupId, memberId1, memberId2, periodId, recordId;
let passed = 0, failed = 0;
const errors = [];

function test(name, fn) {
  return async () => {
    try {
      await fn();
      passed++;
      process.stdout.write(`  ✅ ${name}\n`);
    } catch (e) {
      failed++;
      errors.push(name);
      process.stdout.write(`  ❌ ${name}: ${e.message}\n`);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🚀 COMPREHENSIVE E2E — All Features');
  console.log(`Server: ${BASE}\n`);

  const now = Date.now();
  hostEmail = `e2e-host-${now}@test.com`;
  memberEmail = `e2e-member-${now}@test.com`;
  inviteEmail = `e2e-invite-${now}@test.com`;

  // ═══════════════════════  AUTH (10)  ═══════════════════════════════════
  console.log('📋 AUTH');

  await test('01. Register host', async () => {
    const res = await api('POST', '/auth/register', {
      body: { email: hostEmail, name: 'Host E2E' },
    });
    if (res.status !== 201) throw new Error(`${res.status}: ${JSON.stringify(res.body)}`);
    hostOtp = res.body.data.devOtp;
    if (!hostOtp) throw new Error('devOtp not returned');
  })();

  await test('02. Verify OTP host', async () => {
    const res = await api('POST', '/auth/verify-otp', {
      body: { email: hostEmail, otp: hostOtp },
    });
    if (res.status !== 200) throw new Error(`${res.status}: ${JSON.stringify(res.body)}`);
    hostToken = res.body.data.accessToken;
    hostRefresh = res.body.data.refreshToken;
    if (!hostToken) throw new Error('accessToken missing');
  })();

  await test('03. GET profile', async () => {
    const res = await api('GET', '/auth/profile', { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (res.body.data.email !== hostEmail) throw new Error(`Wrong email: ${res.body.data.email}`);
  })();

  await test('04. PATCH profile', async () => {
    const res = await api('PATCH', '/auth/profile', {
      token: hostToken,
      body: { name: 'Host Updated', phone: '08123456789' },
    });
    if (res.status !== 200) throw new Error(`${res.status}`);
  })();

  await test('05. Refresh token', async () => {
    const res = await api('POST', '/auth/refresh', {
      token: hostRefresh,
      body: { refreshToken: hostRefresh },
    });
    if (res.status !== 200) throw new Error(`${res.status}`);
    hostToken = res.body.data.accessToken;
  })();

  await test('06. Register member', async () => {
    const res = await api('POST', '/auth/register', {
      body: { email: memberEmail, name: 'Member E2E' },
    });
    if (res.status !== 201) throw new Error(`${res.status}`);
    memberOtp = res.body.data.devOtp;
    if (!memberOtp) throw new Error('devOtp not returned');
  })();

  await test('07. Verify OTP member', async () => {
    const res = await api('POST', '/auth/verify-otp', {
      body: { email: memberEmail, otp: memberOtp },
    });
    if (res.status !== 200) throw new Error(`${res.status}`);
    memberToken = res.body.data.accessToken;
    memberRefresh = res.body.data.refreshToken;
  })();

  await test('08. Reject register empty email', async () => {
    const res = await api('POST', '/auth/register', { body: { name: 'No Email' } });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('09. Reject invalid email', async () => {
    const res = await api('POST', '/auth/register', { body: { email: 'bad-email', name: 'Bad' } });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('10. Reject wrong OTP', async () => {
    const res = await api('POST', '/auth/verify-otp', { body: { email: hostEmail, otp: '000000' } });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  // ═══════════════════════  GROUPS (10)  ════════════════════════════════
  console.log('\n📋 GROUPS');

  await test('11. Create group', async () => {
    const res = await api('POST', '/groups', {
      token: hostToken,
      body: {
        name: 'Netflix Squad', serviceName: 'Netflix Premium',
        totalAmount: 100000, frequency: 'monthly', dueDay: 15, splitMethod: 'equal',
      },
    });
    if (res.status !== 201) throw new Error(`${res.status}`);
    if (res.body.data.name !== 'Netflix Squad') throw new Error('Wrong name');
    groupId = res.body.data.id;
  })();

  await test('12. List groups', async () => {
    const res = await api('GET', '/groups', { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (!res.body.data.some(g => g.group.id === groupId)) throw new Error('Group not in list');
  })();

  await test('13. Get group detail', async () => {
    const res = await api('GET', `/groups/${groupId}`, { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (res.body.data.group.id !== groupId) throw new Error('Wrong group');
    if (!res.body.data.currentPeriod) throw new Error('currentPeriod missing');
  })();

  await test('14. Update group', async () => {
    const res = await api('PATCH', `/groups/${groupId}`, {
      token: hostToken,
      body: { description: 'Updated desc' },
    });
    if (res.status !== 200) throw new Error(`${res.status}`);
  })();

  await test('15. Reject missing fields', async () => {
    const res = await api('POST', '/groups', { token: hostToken, body: { name: 'Incomplete' } });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('16. Reject totalAmount < 1000', async () => {
    const res = await api('POST', '/groups', {
      token: hostToken,
      body: { name: 'T', serviceName: 'T', totalAmount: 500, frequency: 'monthly', dueDay: 15, splitMethod: 'equal' },
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('17. Reject dueDay > 28', async () => {
    const res = await api('POST', '/groups', {
      token: hostToken,
      body: { name: 'T', serviceName: 'T', totalAmount: 100000, frequency: 'monthly', dueDay: 32, splitMethod: 'equal' },
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('18. Reject invalid splitMethod', async () => {
    const res = await api('POST', '/groups', {
      token: hostToken,
      body: { name: 'T', serviceName: 'T', totalAmount: 100000, frequency: 'monthly', dueDay: 15, splitMethod: 'invalid' },
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('19. Reject non-host update', async () => {
    const res = await api('PATCH', `/groups/${groupId}`, { token: memberToken, body: { name: 'Hacked' } });
    if (res.status !== 403) throw new Error(`Expected 403 got ${res.status}`);
  })();

  await test('20. Reject delete with active cycle', async () => {
    const res = await api('DELETE', `/groups/${groupId}`, { token: hostToken });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  // ═══════════════════════  MEMBERS (10)  ═══════════════════════════════
  console.log('\n📋 MEMBERS');

  await test('21. Add existing user as member', async () => {
    const res = await api('POST', `/groups/${groupId}/members`, {
      token: hostToken,
      body: { email: memberEmail, displayName: 'Member E2E' },
    });
    if (res.status !== 201) throw new Error(`${res.status}`);
    memberId1 = res.body.data.id;
  })();

  await test('22. Add member by invite email', async () => {
    const res = await api('POST', `/groups/${groupId}/members`, {
      token: hostToken,
      body: { email: inviteEmail, displayName: 'Invited Member' },
    });
    if (res.status !== 201) throw new Error(`${res.status}`);
    memberId2 = res.body.data.id;
  })();

  await test('23. List members (3)', async () => {
    const res = await api('GET', `/groups/${groupId}/members`, { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (res.body.data.length !== 3) throw new Error(`Expected 3, got ${res.body.data.length}`);
  })();

  await test('24. Update member share', async () => {
    const res = await api('PATCH', `/groups/${groupId}/members/${memberId1}`, {
      token: hostToken, body: { shareAmount: 40000 },
    });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (Number(res.body.data.shareAmount) !== 40000) throw new Error('shareAmount not updated');
  })();

  await test('25. Soft-delete member', async () => {
    const res = await api('DELETE', `/groups/${groupId}/members/${memberId2}`, { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
  })();

  await test('26. Verify 2 members after delete', async () => {
    const res = await api('GET', `/groups/${groupId}/members`, { token: hostToken });
    if (res.body.data.length !== 2) throw new Error(`Expected 2, got ${res.body.data.length}`);
  })();

  await test('27. Re-add removed member', async () => {
    const res = await api('POST', `/groups/${groupId}/members`, {
      token: hostToken,
      body: { email: inviteEmail, displayName: 'Re-invited' },
    });
    if (res.status !== 201) throw new Error(`${res.status}`);
  })();

  await test('28. Verify 3 members after re-add', async () => {
    const res = await api('GET', `/groups/${groupId}/members`, { token: hostToken });
    if (res.body.data.length !== 3) throw new Error(`Expected 3, got ${res.body.data.length}`);
  })();

  await test('29. Reject empty email', async () => {
    const res = await api('POST', `/groups/${groupId}/members`, {
      token: hostToken, body: { displayName: 'No Email' },
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('30. Reject duplicate (host self)', async () => {
    const res = await api('POST', `/groups/${groupId}/members`, {
      token: hostToken, body: { email: hostEmail, displayName: 'Self Dup' },
    });
    if (res.status !== 409) throw new Error(`Expected 409 got ${res.status}`);
  })();

  // ═══════════════════════  PAYMENTS (13)  ══════════════════════════════
  console.log('\n📋 PAYMENTS');

  await test('31. List periods', async () => {
    const res = await api('GET', `/payments/groups/${groupId}/periods`, { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (!res.body.data.length) throw new Error('No periods');
    periodId = res.body.data[0].period.id;
    recordId = res.body.data[0].myRecord.id;
  })();

  await test('32. Get period detail (host)', async () => {
    const res = await api('GET', `/payments/groups/${groupId}/periods/${periodId}`, { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (res.body.data.myRole !== 'host') throw new Error(`Expected host, got ${res.body.data.myRole}`);
    if (!res.body.data.records.length) throw new Error('No records');
  })();

  await test('33. Host marks own payment paid', async () => {
    const res = await api('PATCH', `/payments/records/${recordId}/mark-paid`, {
      token: hostToken,
      body: { paymentMethod: 'BCA Transfer', paymentNote: 'Bayar host share' },
    });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (res.body.data.status !== 'paid') throw new Error(`Expected paid, got ${res.body.data.status}`);
    if (res.body.data.paymentMethod !== 'BCA Transfer') throw new Error('paymentMethod mismatch');
  })();

  await test('34. Verify record shows paid', async () => {
    const res = await api('GET', `/payments/groups/${groupId}/periods`, { token: hostToken });
    const p = res.body.data.find(item => item.period.id === periodId);
    if (!p) throw new Error('Period not found');
    if (p.myRecord.status !== 'paid') throw new Error(`Expected paid, got ${p.myRecord.status}`);
    if (Number(p.myRecord.amountPaid) <= 0) throw new Error('amountPaid should be > 0');
  })();

  await test('35. Member sees own record', async () => {
    const res = await api('GET', `/payments/groups/${groupId}/periods/${periodId}`, { token: memberToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (res.body.data.myRole !== 'payer') throw new Error(`Expected payer, got ${res.body.data.myRole}`);
    if (res.body.data.records.length > 1) throw new Error('Member should see at most 1 record');
  })();

  await test('36. Host waives member payment', async () => {
    const periodRes = await api('GET', `/payments/groups/${groupId}/periods/${periodId}`, { token: hostToken });
    const memberRecord = periodRes.body.data.records.find(r => r.member?.email === memberEmail);
    if (!memberRecord) throw new Error('Member record not found');
    if (memberRecord.status !== 'pending') throw new Error(`Expected pending, got ${memberRecord.status}`);

    const waiveRes = await api('PATCH', `/payments/records/${memberRecord.id}/waive`, { token: hostToken });
    if (waiveRes.status !== 200) throw new Error(`${waiveRes.status}`);
    if (waiveRes.body.data.status !== 'waived') throw new Error(`Expected waived, got ${waiveRes.body.data.status}`);
  })();

  await test('37. POST confirm with signed token', async () => {
    const token = generateSignedToken({ recordId }, SIGNED_URL_SECRET, 259200);
    const res = await api('POST', '/payments/confirm', { body: { token } });
    if (res.status !== 200) throw new Error(`${res.status}: ${JSON.stringify(res.body)}`);
    if (res.body.data.status !== 'paid') throw new Error(`Expected paid, got ${res.body.data.status}`);
  })();

  await test('38. Reject invalid token format', async () => {
    const res = await api('POST', '/payments/confirm', { body: { token: 'bad-format' } });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('39. Reject tampered token', async () => {
    const token = generateSignedToken({ recordId }, SIGNED_URL_SECRET, 259200) + 'x';
    const res = await api('POST', '/payments/confirm', { body: { token } });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('40. GET confirm redirects to success', async () => {
    const token = generateSignedToken({ recordId }, SIGNED_URL_SECRET, 259200);
    const url = `${BASE}/payments/confirm?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { redirect: 'manual' });
    if (res.status !== 302) throw new Error(`Expected 302 got ${res.status}`);
    const loc = res.headers.get('location');
    if (!loc.includes('/payment/success')) throw new Error(`Unexpected redirect: ${loc}`);
  })();

  await test('41. GET confirm redirects to error', async () => {
    const res = await fetch(`${BASE}/payments/confirm?token=invalid-token`, { redirect: 'manual' });
    if (res.status !== 302) throw new Error(`Expected 302 got ${res.status}`);
    if (!res.headers.get('location').includes('/payment/error')) throw new Error('Expected error redirect');
  })();

  await test('42. Reject non-host mark-paid', async () => {
    const res = await api('PATCH', `/payments/records/${recordId}/mark-paid`, {
      token: memberToken, body: {},
    });
    if (res.status !== 403) throw new Error(`Expected 403 got ${res.status}`);
  })();

  await test('43. Reject unauthed period list', async () => {
    const res = await api('GET', `/payments/groups/${groupId}/periods`, { token: 'invalid-token' });
    if (res.status !== 401) throw new Error(`Expected 401 got ${res.status}`);
  })();

  // ═══════════════════════  NOTIFICATIONS (7)  ══════════════════════════
  console.log('\n📋 NOTIFICATIONS');

  const testEndpoint = `https://fcm.googleapis.com/fcm/send/e2e-test-${now}`;

  await test('44. Subscribe to push', async () => {
    const res = await api('POST', '/push/subscribe', {
      token: hostToken,
      body: {
        endpoint: testEndpoint,
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    });
    if (res.status !== 201) throw new Error(`${res.status}`);
    if (res.body.data.endpoint !== testEndpoint) throw new Error('endpoint mismatch');
  })();

  await test('45. List subscriptions', async () => {
    const res = await api('GET', '/push/subscriptions', { token: hostToken });
    if (res.status !== 200) throw new Error(`${res.status}`);
    if (!res.body.data.some(s => s.endpoint === testEndpoint)) throw new Error('Subscription not found');
  })();

  await test('46. Unsubscribe', async () => {
    const res = await api('DELETE', '/push/unsubscribe', {
      token: hostToken, body: { endpoint: testEndpoint },
    });
    if (res.status !== 204) throw new Error(`Expected 204 got ${res.status}`);
  })();

  await test('47. Verify unsubscribed', async () => {
    const res = await api('GET', '/push/subscriptions', { token: hostToken });
    if (res.body.data.some(s => s.endpoint === testEndpoint)) throw new Error('Should be unsubscribed');
  })();

  await test('48. Re-subscribe (upsert)', async () => {
    const res = await api('POST', '/push/subscribe', {
      token: hostToken,
      body: {
        endpoint: testEndpoint,
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      },
    });
    if (res.status !== 201) throw new Error(`${res.status}`);
  })();

  await test('49. Reject subscribe missing endpoint', async () => {
    const res = await api('POST', '/push/subscribe', {
      token: hostToken, body: { p256dh: 'key', auth: 'secret' },
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('50. Reject subscribe non-URL endpoint', async () => {
    const res = await api('POST', '/push/subscribe', {
      token: hostToken, body: { endpoint: 'not-a-url', p256dh: 'key', auth: 'secret' },
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  // ═══════════════════════  GUARDS (2)  ═════════════════════════════════
  console.log('\n📋 GROUP LIFECYCLE GUARDS');

  await test('51. Block delete with active cycle', async () => {
    const res = await api('DELETE', `/groups/${groupId}`, { token: hostToken });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  await test('52. Block split-method change', async () => {
    const res = await api('PATCH', `/groups/${groupId}`, {
      token: hostToken, body: { splitMethod: 'custom_nominal' },
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status}`);
  })();

  // ═══════════════════════  SUMMARY  ════════════════════════════════════
  console.log('\n' + '═'.repeat(45));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);

  if (errors.length) {
    console.log('\nFailed:', errors.join(', '));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
