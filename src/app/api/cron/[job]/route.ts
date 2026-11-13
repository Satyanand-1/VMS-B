import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { addDays, fmtDate, todayISO } from '@/lib/format';
import { audit } from '@/lib/audit';

// Daily jobs, called by a scheduler (Supabase Cron / Vercel Cron) with "Authorization: Bearer <CRON_SECRET>".
//   document-expiry  — DOC-3: email the owner and the account manager 30 days before a document expires
//   password-expiry  — AUTH-5: warn external users 5 days before their password expires
//   audit-retention  — AUD-2: delete audit entries older than 120 days (invoices and documents are never deleted)
export async function POST(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse('Unauthorized', { status: 401 });
  const { job } = await params;
  const today = todayISO();
  let done = 0;
  if (job === 'document-expiry') {
    const target = addDays(today, 30);
    const docs = (await db().from('documents').select('id,owner_kind,owner_id,doc_type,valid_to').eq('valid_to', target)).data || [];
    for (const d of docs) {
      const owner = d.owner_kind === 'vendor' ? (await db().from('vendors').select('name,email,account_manager_id').eq('id', d.owner_id).single()).data
        : d.owner_kind === 'person' ? (await db().from('people').select('full_name,email,account_manager_id').eq('id', d.owner_id).single()).data
        : (await db().from('clients').select('name,email').eq('id', d.owner_id).single()).data;
      if (!owner) continue;
      const name = (owner as { name?: string; full_name?: string }).name || (owner as { full_name?: string }).full_name;
      const text = `${d.doc_type} for ${name} expires on ${fmtDate(d.valid_to)}. Please upload a renewed copy in AT VMS.`;
      if (d.owner_kind !== 'client') await sendEmail('expiry_alert', (owner as { email: string }).email, `${d.doc_type} expires in 30 days`, text);
      const amId = (owner as { account_manager_id?: string }).account_manager_id;
      if (amId) {
        const am = (await db().from('user_accounts').select('email').eq('id', amId).single()).data;
        if (am) await sendEmail('expiry_alert', am.email, `${d.doc_type} — ${name} expires in 30 days`, text);
      }
      done++;
    }
  } else if (job === 'password-expiry') {
    const accs = (await db().from('user_accounts').select('id,email,full_name,password_expires_at').in('role', ['vendor', 'resource']).eq('status', 'active')).data || [];
    for (const a of accs) {
      if (a.password_expires_at?.slice(0, 10) !== addDays(today, 5)) continue;
      await sendEmail('password_warning', a.email, 'Your AT VMS password expires in 5 days', `Hello ${a.full_name},\n\nYour password expires on ${fmtDate(a.password_expires_at)}. Change it from the profile menu → Change Password.\n\nArkhya Tech`);
      await db().from('notifications').insert({ user_id: a.id, title: 'Your password expires in 5 days', link: '/change-password' });
      done++;
    }
  } else if (job === 'audit-retention') {
    const cutoff = new Date(Date.now() - 120 * 86400000).toISOString();
    const { count } = await db().from('audit_log').delete({ count: 'exact' }).lt('at', cutoff);
    done = count || 0;
    await audit(null, 'delete', 'audit_log', null, `retention job removed ${done} audit entries older than 120 days`);
  } else {
    return new NextResponse('Unknown job', { status: 404 });
  }
  return NextResponse.json({ job, done });
}
