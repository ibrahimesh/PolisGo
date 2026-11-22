import { randomUUID } from "node:crypto";
// Throwaway accounts get a fresh password per run; none is stored here.
const PW = `Pw-${randomUUID()}-Aa1`;
const WRONG = () => `Wrong-${randomUUID()}-Aa1`;
// Audit probes against the running stack (real SQL Server). Prints findings
// only; never prints credentials or tokens.
const API = process.env.API ?? 'http://localhost:8080';
const { SEED_ADMIN_EMAIL: adminEmail, SEED_ADMIN_PASSWORD: adminPassword } = process.env;
const run = Date.now().toString(36);
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const yearsAgo = (n) => { const d = new Date(today); d.setUTCFullYear(d.getUTCFullYear() - n); return iso(d); };

async function call(method, path, { token, body, raw } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
  const started = performance.now();
  const res = await fetch(API + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const ms = performance.now() - started;
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, json, ms, headers: res.headers, bytes: text.length };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).json?.token;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const out = (label, value) => console.log(`${label.padEnd(58)} ${typeof value === 'string' ? value : JSON.stringify(value)}`);

let plateSeq = 0;
const plate = () => `${run.slice(-4).toUpperCase()} ${++plateSeq}`.replace(/[^A-Z0-9 ]/g, 'X');
const vin = () => (run.toUpperCase().replace(/[IOQ]/g, 'X') + 'A1B2C3D4E5F6G7H8').replace(/[^A-HJ-NPR-Z0-9]/g, '7').slice(0, 15) + String(plateSeq).padStart(2, '0');

async function registerClient(tag, birth = '1990-05-01', licence = '2010-06-01') {
  const email = `audit.${tag}.${run}@polisgo.test`;
  const password = PW;
  const r = await call('POST', '/api/auth/register', { body: { email, password, fullName: 'Audit Client', phone: '+994501234567', birthDate: birth, drivingLicenseDate: licence } });
  if (r.status !== 200) throw new Error(`register ${tag}: ${r.status} ${JSON.stringify(r.json)}`);
  return { email, password, token: r.json.token };
}
async function vehicle(token, engine = 1800, year = today.getUTCFullYear() - 1) {
  const r = await call('POST', '/api/vehicles', { token, body: { make: 'Toyota', model: 'Corolla', year, engineCapacityCc: engine, plateNumber: plate(), vin: vin() } });
  if (r.status !== 201 && r.status !== 200) throw new Error(`vehicle: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.id;
}

const admin = await login(adminEmail, adminPassword);
out('admin login', admin ? 'ok' : 'FAILED');

// --- Brute force / lockout / enumeration
const victim = await registerClient('victim');
const wrong = [];
for (let i = 0; i < 30; i++) wrong.push((await call('POST', '/api/auth/login', { body: { email: victim.email, password: WRONG() } })).status);
const counts = wrong.reduce((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {});
out('30 wrong passwords in a row -> statuses', counts);
out('then the right password', (await call('POST', '/api/auth/login', { body: { email: victim.email, password: victim.password } })).status);
const tKnown = [], tUnknown = [];
for (let i = 0; i < 10; i++) {
  tKnown.push((await call('POST', '/api/auth/login', { body: { email: victim.email, password: WRONG() } })).ms);
  tUnknown.push((await call('POST', '/api/auth/login', { body: { email: `nobody.${i}.${run}@polisgo.test`, password: WRONG() } })).ms);
}
out('login median ms: existing email / unknown email', `${median(tKnown).toFixed(0)} / ${median(tUnknown).toFixed(0)}`);
const dup = await call('POST', '/api/auth/register', { body: { email: victim.email, password: PW, fullName: 'X Y', phone: '+994501234567', birthDate: '1990-05-01', drivingLicenseDate: '2010-06-01' } });
out('register with an existing email', `${dup.status} "${dup.json?.detail}"`);

// --- Paging and date edges -> 500 on SQL Server
for (const [path, token] of [
  ['/api/claims?page=2147483647', victim.token],
  ['/api/policies?page=2147483647', victim.token],
  ['/api/customers?page=2147483647', admin],
  ['/api/users/staff?page=2147483647', admin],
  ['/api/admin/dashboard?to=9999-12-31', admin],
  ['/api/admin/dashboard?to=0001-01-15', admin],
  ['/api/admin/audit?to=9999-12-31', admin],
]) {
  const r = await call('GET', path, { token });
  out(`GET ${path}`, `${r.status} ${r.json?.title ?? ''} | ${String(r.json?.detail ?? '').slice(0, 90)}`);
}

// --- Pricing factors frozen at decimal(9,4)
const young = await registerClient('young', yearsAgo(20), yearsAgo(1));
const youngCar = await vehicle(young.token, 1800);
const start = iso(today);
const quote = await call('POST', '/api/policies/quote', { token: young.token, body: { vehicleId: youngCar, policyTypeCode: 'CASCO', startDate: start, termMonths: 5 } });
const created = await call('POST', '/api/policies', { token: young.token, body: { vehicleId: youngCar, policyTypeCode: 'CASCO', startDate: start, termMonths: 5 } });
const detail = await call('GET', `/api/policies/${created.json.id}`, { token: young.token });
const p = detail.json.pricing;
out('quote totalFactor / termFactor (computed)', `${quote.json.totalFactor} / ${quote.json.termFactor}`);
out('stored totalFactor / termFactor (decimal(9,4))', `${p.totalFactor} / ${p.termFactor}`);
out('premium vs baseRate x stored totalFactor', `${p.premium} vs ${(p.baseRate * p.totalFactor).toFixed(4)}`);

// --- Parallel pay on one Draft
const payer = await registerClient('payer');
const payerCar = await vehicle(payer.token);
const draft = await call('POST', '/api/policies', { token: payer.token, body: { vehicleId: payerCar, policyTypeCode: 'MTPL', startDate: start, termMonths: 12 } });
const pays = await Promise.all(Array.from({ length: 20 }, () => call('POST', `/api/policies/${draft.json.id}/pay`, { token: payer.token })));
const payCounts = pays.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
const paidDetail = await call('GET', `/api/policies/${draft.json.id}`, { token: payer.token });
out('20 parallel POST /pay -> statuses', payCounts);
out('payments stored / Draft->Active history rows', `${paidDetail.json.payments.length} / ${paidDetail.json.history.filter((h) => h.toStatus === 'Active').length}`);
out('sum charged vs premium', `${paidDetail.json.payments.reduce((s, x) => s + x.amount, 0).toFixed(2)} vs ${paidDetail.json.policy.premium}`);

// --- Adjuster cancels a client's policy (SQL Server)
const adjEmail = `audit.adjuster.${run}@polisgo.test`;
const adjCreate = await call('POST', '/api/users/staff', { token: admin, body: { email: adjEmail, password: PW, fullName: 'Audit Adjuster', role: 'Adjuster' } });
const adjuster = await login(adjEmail, PW);
const seen = await call('GET', '/api/policies?pageSize=50', { token: adjuster });
out('adjuster created / sees policies (all customers)', `${adjCreate.status} / ${seen.json.totalCount}`);
const cancel = await call('POST', `/api/policies/${draft.json.id}/cancel`, { token: adjuster });
out("adjuster POST /cancel on a client's paid policy", `${cancel.status} -> ${cancel.json?.status}`);

// --- Same-day claim, document download headers
const sameDay = await registerClient('sameday');
const sdCar = await vehicle(sameDay.token);
const sdPolicy = await call('POST', '/api/policies', { token: sameDay.token, body: { vehicleId: sdCar, policyTypeCode: 'MTPL', startDate: start, termMonths: 12 } });
await call('POST', `/api/policies/${sdPolicy.json.id}/pay`, { token: sameDay.token });
const sdClaim = await call('POST', '/api/claims', { token: sameDay.token, body: { policyId: sdPolicy.json.id, incidentDate: start, description: 'Collision earlier today before I bought cover.', claimedAmount: 1500, incidentType: 'Collision', location: 'Baku' } });
out('claim for an incident on the purchase day', sdClaim.status);
const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6360000000020001E221BC330000000049454E44AE426082', 'hex');
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'photo.png');
const up = await fetch(`${API}/api/claims/${sdClaim.json.id}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${sameDay.token}` }, body: form });
const doc = await up.json();
const down = await call('GET', `/api/claims/${sdClaim.json.id}/documents/${doc.id}`, { token: sameDay.token });
out('document download Content-Type / Disposition', `${down.headers.get('content-type')} / ${down.headers.get('content-disposition')}`);
for (const h of ['x-content-type-options', 'cache-control', 'content-security-policy', 'x-frame-options', 'referrer-policy']) {
  out(`  header ${h}`, down.headers.get(h) ?? '(absent)');
}
