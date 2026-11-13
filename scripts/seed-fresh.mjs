// Fresh start: an empty system with only the Super Admin account. Everything else is created from the app.
// Usage: node --env-file=.env.local scripts/seed-fresh.mjs
//   SUPER_ADMIN_EMAIL / SUPER_ADMIN_NAME   who the Super Admin is
//   SUPER_ADMIN_PASSWORD                   fixed password (local development)
//   SUPER_ADMIN_TEMP=1                     random temporary password instead; it must be changed at first sign-in
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'crypto';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = (process.env.SUPER_ADMIN_EMAIL || 'a.krishnan@arkhyatech.com').toLowerCase();
const name = process.env.SUPER_ADMIN_NAME || 'Arun Krishnan';
const temp = process.env.SUPER_ADMIN_TEMP === '1';
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#%+=';
const password = temp ? Array.from({ length: 16 }, () => chars[randomInt(chars.length)]).join('') : process.env.SUPER_ADMIN_PASSWORD || 'password123';

const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw new Error(`Super Admin: ${error.message}`);
const res = await sb.from('user_accounts').insert({
  id: data.user.id, role: 'super_admin', email, full_name: name, status: 'active',
  password_set_at: new Date().toISOString(), must_change_password: temp
});
if (res.error) throw new Error(res.error.message);
console.log(`Super Admin created: ${email}`);
if (temp) console.log(`Temporary password: ${password}  (you will be asked to set a new one at first sign-in)`);
