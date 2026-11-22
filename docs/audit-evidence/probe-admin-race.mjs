import { randomUUID } from "node:crypto";
// Throwaway accounts get a fresh password per run; none is stored here.
const PW = `Pw-${randomUUID()}-Aa1`;
// Last-active-admin race on SQL Server. Leaves the stack with no active
// admin when it succeeds, so run it only on a throwaway database.
const API = process.env.API ?? 'http://localhost:8080';
const { SEED_ADMIN_EMAIL: seedEmail, SEED_ADMIN_PASSWORD: seedPassword } = process.env;
const run = Date.now().toString(36);
const pw = PW;

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json; try { json = await res.json(); } catch { json = undefined; }
  return { status: res.status, json };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', undefined, { email, password })).json?.token;
const activeAdmins = async (token) => (await call('GET', '/api/users/staff?role=Admin&status=Active&pageSize=50', token)).json?.totalCount;

let controller = { email: seedEmail, password: seedPassword };
for (let attempt = 1; attempt <= 8; attempt++) {
  const ctl = await login(controller.email, controller.password);
  const make = async (tag) => {
    const email = `audit.admin.${tag}.${attempt}.${run}@polisgo.test`;
    const r = await call('POST', '/api/users/staff', ctl, { email, password: pw, fullName: 'Audit Admin', role: 'Admin' });
    return { email, password: pw, id: r.json.id };
  };
  const a = await make('a');
  const b = await make('b');
  const ta = await login(a.email, a.password);
  const tb = await login(b.email, b.password);
  // a retires every other active admin, so a and b are the last two.
  const others = (await call('GET', '/api/users/staff?role=Admin&status=Active&pageSize=50', ta)).json.items
    .filter((u) => u.id !== a.id && u.id !== b.id);
  for (const u of others) await call('POST', `/api/users/${u.id}/deactivate`, ta);
  const before = await activeAdmins(ta);

  const [ra, rb] = await Promise.all([
    call('POST', `/api/users/${b.id}/deactivate`, ta),
    call('POST', `/api/users/${a.id}/deactivate`, tb),
  ]);
  const survivor = [ [a, ra], [b, rb] ].find(([, r]) => r.status !== 200);
  const checker = await login(a.email, a.password) ?? await login(b.email, b.password);
  const after = checker ? await activeAdmins(checker) : 0;
  console.log(`attempt ${attempt}: active admins before=${before}; a->b ${ra.status}, b->a ${rb.status}; active admins after=${after}`);
  if (ra.status === 200 && rb.status === 200) {
    const anyLogin = await call('POST', '/api/auth/login', undefined, { email: a.email, password: a.password });
    console.log(`no active admin left; sign-in as either former admin -> ${anyLogin.status}`);
    break;
  }
  // Lost the race: the survivor becomes the controller for the next try.
  controller = survivor ? (survivor[0] === a ? b : a) : a;
}
