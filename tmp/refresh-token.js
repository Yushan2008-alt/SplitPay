const fs = require('fs');
const http = require('http');

const API = 'http://localhost:3001/api/v1';
const TMP = 'C:\\Users\\CANDRA DEWI\\Desktop\\.vscode\\Uji Coba\\SplitPay\\Backend\\splitpay-backend\\tmp';
const REG_EMAIL = 'sec99reg@example.com';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const data = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { 'Authorization': 'Bearer ' + token } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
  });
}

(async () => {
  // Register
  let r = await post('/auth/register', { email: REG_EMAIL, name: 'Second User', phone: '081888111222' });
  const otp = r.data.devOtp;
  console.log('OTP:', otp);

  // Verify
  r = await post('/auth/verify-otp', { email: REG_EMAIL, otp });
  const token = r.data.accessToken;
  console.log('Token length:', token ? token.length : 'null');

  // Test 1: non-existent group -> 403
  r = await get('/groups/00000000-0000-4000-8000-000000000000', token);
  console.log('Non-existent group:', r.error?.statusCode, r.error?.code);
  if (r.error?.statusCode === 403) console.log('✅ PASS: 403');
  else console.log('❌ FAIL');

  // Test 2: unknown email OTP
  r = await post('/auth/verify-otp', { email: 'ghost999@example.com', otp: '123456' });
  console.log('Unknown email OTP:', r.error?.message);
  if (r.error?.message === 'OTP tidak valid') console.log('✅ PASS');
  else console.log('❌ FAIL');

  // Test 3: empty payload
  r = await post('/auth/register', {});
  console.log('Empty payload:', r.error?.code, r.error?.statusCode);
  if (r.error?.code === 'VALIDATION_ERROR') console.log('✅ PASS');
  else console.log('❌ FAIL');
})();
