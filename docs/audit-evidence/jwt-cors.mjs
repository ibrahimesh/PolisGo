import { randomUUID } from "node:crypto";
// Throwaway accounts get a fresh password per run; none is stored here.
const PW = `Pw-${randomUUID()}-Aa1`;
const API = 'http://localhost:8080';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const email = `audit.jwt.${Date.now()}@polisgo.test`;
const reg = await (await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: PW, fullName: 'Audit Jwt', phone: '+994501234567', birthDate: '1990-05-01', drivingLicenseDate: '2010-06-01', role: 'Admin' }) })).json();
const [h, p, sig] = reg.token.split('.');
const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
const roleKey = Object.keys(claims).find((k) => k.endsWith('/role') || k === 'role');
const get = async (path, token) => (await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } })).status;
console.log('register with "role":"Admin" in the body -> token role:', claims[roleKey]);
console.log('valid client token, GET /api/users/staff ->', await get('/api/users/staff', reg.token));
console.log('role claim edited to Admin, same signature ->', await get('/api/users/staff', `${h}.${b64({ ...claims, [roleKey]: 'Admin' })}.${sig}`));
console.log('alg "none", role Admin, no signature ->', await get('/api/users/staff', `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims, [roleKey]: 'Admin' })}.`));
console.log('expired exp (signature kept) ->', await get('/api/me', `${h}.${b64({ ...claims, exp: 1 })}.${sig}`));
const pre = await fetch(`${API}/api/policies`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
console.log('CORS preflight from https://evil.example -> ACAO:', pre.headers.get('access-control-allow-origin') ?? '(none)', '| status', pre.status);
const ok = await fetch(`${API}/api/policies`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
console.log('CORS preflight from http://localhost:5173 -> ACAO:', ok.headers.get('access-control-allow-origin'), '| credentials:', ok.headers.get('access-control-allow-credentials') ?? '(not allowed)');
