// Fresh start: an empty system with only the Super Admin account. Everything else is created from the app.
// Usage: node --env-file=.env.local scripts/seed-fresh.mjs
// Change SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env.local, or sign in and change the password afterwards.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = (process.env.SUPER_ADMIN_EMAIL || 'a.krishnan@arkhyatech.com').toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || 'password123';
const name = process.env.SUPER_ADMIN_NAME || 'Arun Krishnan';

const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw new Error(`Super Admin: ${error.message}`);
const res = await sb.from('user_accounts').insert({ id: data.user.id, role: 'super_admin', email, full_name: name, status: 'active', password_set_at: new Date().toISOString() });
if (res.error) throw new Error(res.error.message);
console.log(`Fresh database ready. Super Admin: ${email}`);
