const http = require('http');
const API = 'http://localhost:3001/api/v1';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const isBody = body && method !== 'GET';
    const data = isBody ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname, port: u.port,
      path: u.pathname + (u.search || ''),
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let pass = 0, fail = 0, tests = [];

function t(name, fn) { tests.push({ name, fn }); }

async function run() {
  console.log('=========================================');
  console.log('  COMPREHENSIVE E2E TEST - SplitPay');
  console.log('=========================================');

  // Auth tokens
  let hostToken, otherToken, hostId, groupId, periodId, recordId, member1Id, member2Id;

  // ─── AUTH ────────────────────────────────────────────────────────
  t('Health check (no auth)', async () => {
    const r = await request('GET', '/health');
    return r.status === 200 && r.body.data.redis === 'connected';
  });

  t('Register host user', async () => {
    const r = await request('POST', '/auth/register', { email: 'e2ehost@example.com', name: 'E2E Host', phone: '081999000001' });
    if (r.status !== 200) return false;
    hostToken = r.body.data.devOtp;
    return !!hostToken;
  });

  t('Verify host OTP', async () => {
    const r = await request('POST', '/auth/verify-otp', { email: 'e2ehost@example.com', otp: hostToken });
    if (r.status !== 200) return false;
    hostToken = r.body.data.accessToken;
    return !!hostToken;
  });

  t('Register member user', async () => {
    const r = await request('POST', '/auth/register', { email: 'e2emember1@example.com', name: 'E2E Member', phone: '081999000002' });
    if (r.status !== 200) return false;
    otherToken = r.body.data.devOtp;
    return !!otherToken;
  });

  t('Verify member OTP', async () => {
    const r = await request('POST', '/auth/verify-otp', { email: 'e2emember1@example.com', otp: otherToken });
    if (r.status !== 200) return false;
    otherToken = r.body.data.accessToken;
    return !!otherToken;
  });

  // ─── GROUPS ──────────────────────────────────────────────────────
  t('Create group', async () => {
    const r = await request('POST', '/groups', { name: 'E2E Test Group', serviceName: 'Netflix', totalAmount: '150000', dueDay: 15, frequency: 'monthly', splitMethod: 'equal', description: 'E2E group' }, hostToken);
    if (r.status !== 200) return false;
    groupId = r.body.data.id;
    hostId = r.body.data.hostId;
    return !!groupId;
  });

  t('Get group detail (host)', async () => {
    const r = await request('GET', '/groups/' + groupId, null, hostToken);
    return r.status === 200 && r.body.data.group.name === 'E2E Test Group';
  });

  t('List groups (host)', async () => {
    const r = await request('GET', '/groups', null, hostToken);
    return r.status === 200 && r.body.data.length >= 1;
  });

  // ─── MEMBERS ─────────────────────────────────────────────────────
  t('Add member 1', async () => {
    const r = await request('POST', '/groups/' + groupId + '/members', { email: 'e2emember2@example.com', displayName: 'Member Two', notificationPreference: 'email' }, hostToken);
    if (r.status !== 200) return false;
    member1Id = r.body.data.id;
    return true;
  });

  t('Add member 2', async () => {
    const r = await request('POST', '/groups/' + groupId + '/members', { email: 'e2emember3@example.com', displayName: 'Member Three' }, hostToken);
    if (r.status !== 200) return false;
    member2Id = r.body.data.id;
    return true;
  });

  t('List members', async () => {
    const r = await request('GET', '/groups/' + groupId + '/members', null, hostToken);
    return r.status === 200 && r.body.data.length >= 2;
  });

  t('Update member', async () => {
    const r = await request('PATCH', '/groups/' + groupId + '/members/' + member1Id, { displayName: 'Member Two Updated' }, hostToken);
    return r.status === 200;
  });

  // ─── PAYMENTS ────────────────────────────────────────────────────
  t('List periods', async () => {
    const r = await request('GET', '/payments/groups/' + groupId + '/periods', null, hostToken);
    if (r.status !== 200) return false;
    periodId = r.body.data[0].id;
    return !!periodId;
  });

  t('Period detail', async () => {
    const r = await request('GET', '/payments/groups/' + groupId + '/periods/' + periodId, null, hostToken);
    if (r.status !== 200) return false;
    recordId = r.body.data.records[1].id; // first payer record
    return r.body.data.records.length >= 2;
  });

  t('Payment history (host)', async () => {
    const r = await request('GET', '/payments/history', null, hostToken);
    return r.status === 200;
  });

  t('Gateway link blocks without keys', async () => {
    // This should fail because Midtrans/Xendit keys aren't configured
    const r = await request('POST', '/payments/records/' + recordId + '/gateway-link', { provider: 'MIDTRANS' }, hostToken);
    return r.status !== 200; // Should fail gracefully
  });

  // ─── SECURITY ────────────────────────────────────────────────────
  t('Forbidden: other user access group', async () => {
    const r = await request('GET', '/groups/' + groupId, null, otherToken);
    return r.body.error?.statusCode === 403;
  });

  t('Forbidden: non-existent group (403, not 404)', async () => {
    const r = await request('GET', '/groups/00000000-0000-4000-8000-000000000000', null, otherToken);
    return r.body.error?.statusCode === 403;
  });

  t('Forbidden: other user list members', async () => {
    const r = await request('GET', '/groups/' + groupId + '/members', null, otherToken);
    return r.body.error?.statusCode === 403;
  });

  t('No enumeration: unknown email OTP', async () => {
    const r = await request('POST', '/auth/verify-otp', { email: 'nobody999xyz@example.com', otp: '123456' });
    return r.body.error?.message === 'OTP tidak valid';
  });

  t('No enumeration: invalid OTP', async () => {
    const r = await request('POST', '/auth/verify-otp', { email: 'e2ehost@example.com', otp: '000000' });
    return r.body.error?.message === 'OTP tidak valid';
  });

  t('No enumeration: send OTP to unknown email', async () => {
    const r = await request('POST', '/auth/send-otp', { email: 'ghost999xyz@example.com' });
    return r.status === 200; // Should return success regardless
  });

  t('Unauthorized: no token', async () => {
    const r = await request('GET', '/groups', null, null);
    return r.body.error?.statusCode === 401;
  });

  t('Unauthorized: invalid JWT', async () => {
    const r = await request('GET', '/groups', null, 'Bearer invalidtoken123');
    return r.body.error?.statusCode === 401;
  });

  t('Unauthorized: invalid refresh', async () => {
    const r = await request('POST', '/auth/refresh', { refreshToken: 'invalid' });
    return r.status === 401;
  });

  t('Validation: empty payload', async () => {
    const r = await request('POST', '/auth/register', {});
    return r.body.error?.code === 'VALIDATION_ERROR';
  });

  t('Public: health endpoint', async () => {
    const r = await request('GET', '/health', null, null);
    return r.status === 200;
  });

  t('PII: no sensitive fields in profile', async () => {
    const r = await request('GET', '/users/profile', null, hostToken);
    if (r.status !== 200) return false;
    const sensitive = ['password','otp','otpCode','tokenHash','secret'];
    const keys = Object.keys(r.body.data || {});
    return !sensitive.some(s => keys.includes(s));
  });

  // ─── RUN ─────────────────────────────────────────────────────────
  for (const test of tests) {
    try {
      const ok = await test.fn();
      if (ok) { pass++; process.stdout.write('  ✅ '); }
      else { fail++; process.stdout.write('  ❌ '); }
      console.log(test.name);
    } catch (e) {
      fail++;
      console.log('  ❌ ' + test.name + ' — EXCEPTION: ' + e.message);
    }
  }

  console.log('\n=========================================');
  console.log('  RESULTS: ' + pass + ' passed, ' + fail + ' failed');
  console.log('=========================================');
  process.exit(fail > 0 ? 1 : 0);
}

run();
