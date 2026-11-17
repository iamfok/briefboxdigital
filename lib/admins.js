// Admin users, roles and the activity log.
import { all, one, run } from './db.js';
import { hashPassword, verifyPassword, passwordProblem, randomPassword } from './auth.js';

export const ROLES = { owner: 'Super Admin', editor: 'Editor', viewer: 'Viewer' };
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const cleanEmail = e => String(e || '').trim().toLowerCase();

export const can = {
  readContent: u => !!u,
  editContent: u => u && (u.role === 'owner' || u.role === 'editor'),
  inbox: u => u && (u.role === 'owner' || u.role === 'editor'),
  owner: u => u && u.role === 'owner',
};

export const publicUser = u => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, role_label: ROLES[u.role] || u.role,
  disabled: !!u.disabled, created_at: u.created_at, last_login_at: u.last_login_at });

export const countAdmins = async d => (await one(d, 'SELECT COUNT(*) AS n FROM admin_users')).n;
export const getAdmin = (d, id) => one(d, 'SELECT * FROM admin_users WHERE id = ?', Number(id));
export const getAdminByEmail = (d, email) => one(d, 'SELECT * FROM admin_users WHERE email = ?', cleanEmail(email));
export const listAdmins = async d => (await all(d, 'SELECT * FROM admin_users ORDER BY created_at')).map(publicUser);

export async function createAdmin(d, { email, name, role = 'editor', password }) {
  email = cleanEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('Enter a valid email address.');
  if (!ROLES[role]) throw err('Unknown role.');
  if (await getAdminByEmail(d, email)) throw err('An admin with this email already exists.', 409);
  const temp = password ? null : randomPassword();
  const problem = passwordProblem(password || temp);
  if (problem) throw err(problem);
  const { hash, salt } = await hashPassword(password || temp);
  const r = await run(d, 'INSERT INTO admin_users(email, name, role, pass_hash, pass_salt, created_at) VALUES(?,?,?,?,?,?)',
    email, String(name || '').trim().slice(0, 80), role, hash, salt, Date.now());
  return { user: await getAdmin(d, r.meta.last_row_id), temp_password: temp };
}

export async function updateAdmin(d, actor, id, { role, disabled, name }) {
  const u = await getAdmin(d, id);
  if (!u) throw err('User not found', 404);
  const next = { role: role ?? u.role, disabled: disabled === undefined ? !!u.disabled : !!disabled, name: name ?? u.name };
  if (!ROLES[next.role]) throw err('Unknown role.');
  if (u.id === actor.id && (next.role !== 'owner' || next.disabled)) throw err('You cannot remove your own Super Admin access.');
  if (u.role === 'owner' && (next.role !== 'owner' || next.disabled)) {
    const owners = (await one(d, "SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND disabled = 0")).n;
    if (owners <= 1) throw err('Keep at least one active Super Admin.');
  }
  await run(d, 'UPDATE admin_users SET role = ?, disabled = ?, name = ? WHERE id = ?', next.role, next.disabled ? 1 : 0, String(next.name || '').slice(0, 80), u.id);
  return getAdmin(d, u.id);
}

export async function deleteAdmin(d, actor, id) {
  const u = await getAdmin(d, id);
  if (!u) throw err('User not found', 404);
  if (u.id === actor.id) throw err('You cannot delete yourself.');
  if (u.role === 'owner') {
    const owners = (await one(d, "SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND disabled = 0")).n;
    if (owners <= 1) throw err('Keep at least one active Super Admin.');
  }
  await run(d, 'DELETE FROM admin_users WHERE id = ?', u.id);
}

export async function resetAdminPassword(d, id) {
  const temp = randomPassword();
  const { hash, salt } = await hashPassword(temp);
  await run(d, 'UPDATE admin_users SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, Number(id));
  return temp;
}
export async function changeOwnPassword(d, u, current, next) {
  if (!(await verifyPassword(current, u.pass_hash, u.pass_salt))) throw err('Your current password is wrong.');
  const problem = passwordProblem(next);
  if (problem) throw err(problem);
  const { hash, salt } = await hashPassword(next);
  await run(d, 'UPDATE admin_users SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, u.id);
  return getAdmin(d, u.id);
}

export async function log(d, who, action, detail = '') {
  try {
    await run(d, 'INSERT INTO activity(at, who, action, detail) VALUES(?,?,?,?)', Date.now(), String(who || ''), action, String(detail).slice(0, 300));
    await run(d, 'DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 500)');
  } catch (e) { /* the log never blocks the action */ }
}
export const activity = (d, limit = 50) => all(d, 'SELECT * FROM activity ORDER BY id DESC LIMIT ?', Math.min(200, Number(limit) || 50));
