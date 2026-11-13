// Seeds the database with the prototype's sample data (run after `supabase db reset`).
// Usage: node --env-file=.env.local scripts/seed.mjs
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, randomBytes } from 'crypto';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = 'password123';
const BUCKET = 'vms-files';

const ok = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const iso = (s) => { if (!s || s === '—') return null; const [m, d, y] = s.replace(',', '').split(' '); return `${y}-${String(MON[m]).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
function encrypt(plain) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv); const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
// A small but real PDF so View / Download work.
function pdf(title) {
  const text = title.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj 0 -28 Td /F1 11 Tf (AT VMS sample document) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
let fileNo = 0;
async function upload(folder, name) {
  const path = `${folder}/${String(++fileNo).padStart(4, '0')}-${name}`;
  ok(await sb.storage.from(BUCKET).upload(path, pdf(name), { contentType: 'application/pdf', upsert: true }), `upload ${name}`);
  return path;
}

/* ---------------- accounts ---------------- */
const accounts = {};
async function account(email, full_name, role, extra = {}) {
  const u = ok(await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), `auth ${email}`).user;
  const external = role === 'vendor' || role === 'resource';
  const set = extra.set || '2026-10-25';
  ok(await sb.from('user_accounts').insert({
    id: u.id, role, email, full_name, phone: extra.phone || null, status: extra.status || 'active',
    password_set_at: `${set}T12:00:00Z`, password_expires_at: external ? `${addDays(set, 30)}T12:00:00Z` : null,
    must_change_password: !!extra.temp, last_login_at: extra.lastLogin || null,
    vendor_id: extra.vendor_id || null, person_id: extra.person_id || null
  }), `account ${email}`);
  accounts[email] = u.id;
  return u.id;
}

const sa = await account('a.krishnan@arkhyatech.com', 'Arun Krishnan', 'super_admin', { phone: '(212) 555-0100', lastLogin: '2026-11-13T14:10:00Z' });
const alicia = await account('a.ross@arkhyatech.com', 'Alicia Ross', 'account_manager', { phone: '(212) 555-0141', lastLogin: '2026-11-13T14:52:00Z' });
const ben = await account('b.cole@arkhyatech.com', 'Benjamin Cole', 'account_manager', { phone: '(213) 555-0177', lastLogin: '2026-11-12T22:10:00Z' });
const priyaN = await account('p.natarajan@arkhyatech.com', 'Priya Natarajan', 'account_manager', { phone: '(312) 555-0119', lastLogin: '2026-11-09T15:00:00Z' });
await account('h.lee@arkhyatech.com', 'Hannah Lee', 'account_manager', { phone: '(617) 555-0103', status: 'invited' });
const amId = { 'Alicia Ross': alicia, 'Benjamin Cole': ben, 'Priya Natarajan': priyaN };

/* ---------------- clients ---------------- */
const clientRows = ok(await sb.from('clients').insert([
  { name: 'Persistent', code: 'PER', address: '2055 Laurelwood Rd, Santa Clara, CA 95054', email: 'ap@persistent.com', time_zone: 'America/Chicago', region: 'Central' },
  { name: 'HTC', code: 'HTC', address: '13920 SE Eastgate Way, Bellevue, WA 98005', email: 'payables@htc.com', time_zone: 'America/New_York', region: 'US-East' },
  { name: 'Citus Tech', code: 'CT', address: '1 World Trade Center, New York, NY 10007', email: 'finance@citustech.com', time_zone: 'America/Los_Angeles', region: 'US-West' }
]).select(), 'clients');
const client = Object.fromEntries(clientRows.map((c) => [c.name, c.id]));
ok(await sb.from('client_account_managers').insert([
  { client_id: client.Persistent, account_manager_id: alicia }, { client_id: client.Persistent, account_manager_id: priyaN },
  { client_id: client.HTC, account_manager_id: alicia },
  { client_id: client['Citus Tech'], account_manager_id: ben }, { client_id: client['Citus Tech'], account_manager_id: alicia }
]), 'client AMs');

/* ---------------- vendors ---------------- */
const vendorData = [
  ['Coral Staffing LLC', 'Austin, TX', '401 Congress Ave, Suite 1540, Austin, TX 78701', 'd.ortiz@coralstaffing.com', 'Daniel Ortiz', '(512) 555-0136', 'Texas', 'Alicia Ross', 'active', '743029118'],
  ['Summit IT Solutions', 'Edison, NJ', '33 Wood Ave S, Suite 600, Edison, NJ 08830', 'ravi@summitits.com', 'Ravi Menon', '(732) 555-0108', 'New Jersey', 'Alicia Ross', 'active', '221874456'],
  ['Ridgeline Talent Group', 'Charlotte, NC', '525 N Tryon St, Suite 1600, Charlotte, NC 28202', 'mprice@ridgelinetalent.com', 'Megan Price', '(704) 555-0119', 'North Carolina', 'Alicia Ross', 'onboarding', '561203347'],
  ['Cascade Data Partners', 'Seattle, WA', '1201 3rd Ave, Suite 2200, Seattle, WA 98101', 'tom@cascadedata.io', 'Tom Hughes', '(206) 555-0164', 'Washington', 'Alicia Ross', 'active', '911447720'],
  ['BluePeak Consulting Inc.', 'Denver, CO', '1700 Lincoln St, Suite 2400, Denver, CO 80203', 'ap@bluepeakconsulting.com', 'Laura Kim', '(303) 555-0142', 'Colorado', 'Benjamin Cole', 'active', '840336190'],
  ['Keystone Tech Partners', 'Pittsburgh, PA', '600 Grant St, Suite 300, Pittsburgh, PA 15219', 'hello@keystonetech.com', 'Sam Patel', '(412) 555-0175', 'Pennsylvania', 'Priya Natarajan', 'invited', '251190873'],
  ['Orbit Systems Group', 'San Jose, CA', '60 S Market St, Suite 1100, San Jose, CA 95113', 'billing@orbitsystems.com', 'Nina Alvarez', '(408) 555-0131', 'California', 'Priya Natarajan', 'inactive', '770215564'],
  ['Harborview Staffing', 'Tacoma, WA', '1102 A St, Suite 300, Tacoma, WA 98402', 'contracts@harborviewstaffing.com', 'Erin Walsh', '(253) 555-0128', 'Washington', 'Alicia Ross', 'onboarding', '912334410']
];
const vendor = {};
for (const [name, city, address, email, contact, phone, state, am, status, ein] of vendorData) {
  const v = ok(await sb.from('vendors').insert({
    name, city, address, email, contact_name: contact, phone, state_of_incorporation: state, signatory_name: contact,
    signatory_phone: phone, payment_term: 'Net 10', account_manager_id: amId[am], status, ein_last4: ein.slice(-4), ein_enc: encrypt(ein)
  }).select().single(), `vendor ${name}`);
  vendor[name] = v.id;
}
const vendorLogins = [
  ['d.ortiz@coralstaffing.com', 'Daniel Ortiz', 'Coral Staffing LLC', { set: '2026-10-16' }],
  ['ravi@summitits.com', 'Ravi Menon', 'Summit IT Solutions', {}],
  ['mprice@ridgelinetalent.com', 'Megan Price', 'Ridgeline Talent Group', { set: '2026-10-13' }],
  ['tom@cascadedata.io', 'Tom Hughes', 'Cascade Data Partners', {}],
  ['ap@bluepeakconsulting.com', 'Laura Kim', 'BluePeak Consulting Inc.', {}],
  ['billing@orbitsystems.com', 'Nina Alvarez', 'Orbit Systems Group', { status: 'inactive' }],
  ['contracts@harborviewstaffing.com', 'Erin Walsh', 'Harborview Staffing', { set: '2026-11-13', temp: true }]
];
for (const [email, name, v, extra] of vendorLogins) await account(email, name, 'vendor', { ...extra, vendor_id: vendor[v] });

/* ---------------- documents ---------------- */
async function doc(owner_kind, owner_id, doc_type, opts = {}) {
  const d = ok(await sb.from('documents').insert({
    owner_kind, owner_id, doc_type, uploader_kind: opts.uploader || 'staff', no_dates: !!opts.noDates,
    valid_from: opts.from || null, valid_to: opts.to || null, audit_period: opts.period || null, not_applicable: !!opts.na
  }).select().single(), `doc ${doc_type}`);
  const versions = opts.versions || (opts.file ? [[opts.file, opts.uploaded, opts.by || 'Alicia Ross', opts.to]] : []);
  let n = 0;
  for (const [file, uploaded, by, until] of versions) {
    const path = await upload(`documents/${owner_kind}/${owner_id}`, file);
    ok(await sb.from('document_versions').insert({
      document_id: d.id, version_no: ++n, storage_path: path, file_name: file, size_bytes: 180000 + n * 1234, mime_type: 'application/pdf',
      uploaded_by: accounts[byEmail[by]] || null, uploaded_by_name: by, uploaded_at: `${uploaded || '2026-01-05'}T15:00:00Z`, valid_to: until || null
    }), 'version');
  }
}
const byEmail = { 'Arun Krishnan': 'a.krishnan@arkhyatech.com', 'Alicia Ross': 'a.ross@arkhyatech.com', 'Benjamin Cole': 'b.cole@arkhyatech.com', 'Daniel Ortiz': 'd.ortiz@coralstaffing.com', 'Ravi Menon': 'ravi@summitits.com' };

// Client MSAs
await doc('client', client.HTC, 'MSA', { from: '2025-02-13', to: '2027-02-12', versions: [
  ['HTC_MSA_2021.pdf', '2021-02-12', 'Arun Krishnan', '2023-02-11'], ['HTC_MSA_2023.pdf', '2023-02-10', 'Alicia Ross', '2025-02-11'], ['HTC_MSA_2025.pdf', '2025-02-07', 'Alicia Ross', '2027-02-12']] });
await doc('client', client.Persistent, 'MSA', { from: '2024-12-10', to: '2026-12-09', versions: [
  ['Persistent_MSA_2022.pdf', '2022-12-05', 'Arun Krishnan', '2024-12-09'], ['Persistent_MSA_2024.pdf', '2024-12-04', 'Alicia Ross', '2026-12-09']] });
await doc('client', client['Citus Tech'], 'MSA', { from: '2026-01-31', to: '2028-01-30', file: 'CitusTech_MSA_2026.pdf', uploaded: '2026-01-28', by: 'Arun Krishnan' });

// Vendor documents (MSA / PO by staff; W-9 / COI / ACH by the vendor)
const cv = vendor['Coral Staffing LLC'];
await doc('vendor', cv, 'MSA', { from: '2026-01-01', to: '2027-12-31', versions: [['Coral_MSA_2024.pdf', '2024-01-03', 'Alicia Ross', '2025-12-31'], ['Coral_MSA_2026.pdf', '2026-01-03', 'Alicia Ross', '2027-12-31']] });
await doc('vendor', cv, 'PO', { from: '2026-01-01', to: '2026-12-31', file: 'PO-38817.pdf', uploaded: '2026-01-03' });
await doc('vendor', cv, 'W-9', { uploader: 'vendor', from: '2026-01-01', to: '2026-12-31', versions: [['Coral_W9_2024.pdf', '2024-02-10', 'Daniel Ortiz', '2024-12-31'], ['Coral_W9_2025.pdf', '2025-02-12', 'Daniel Ortiz', '2025-12-31'], ['Coral_W9_2026.pdf', '2026-02-11', 'Daniel Ortiz', '2026-12-31']] });
await doc('vendor', cv, 'COI', { uploader: 'vendor', from: '2025-11-26', to: '2026-11-25', versions: [['Coral_COI_2024.pdf', '2024-11-20', 'Daniel Ortiz', '2025-11-25'], ['Coral_COI_2025.pdf', '2025-11-18', 'Daniel Ortiz', '2026-11-25']] });
await doc('vendor', cv, 'ACH form', { uploader: 'vendor', noDates: true, file: 'Coral_ACH.pdf', uploaded: '2026-01-03', by: 'Daniel Ortiz' });
const sv = vendor['Summit IT Solutions'];
await doc('vendor', sv, 'MSA', { from: '2026-01-01', to: '2027-12-31', file: 'Summit_MSA_2026.pdf', uploaded: '2026-01-05' });
await doc('vendor', sv, 'W-9', { uploader: 'vendor', from: '2026-07-01', to: '2027-07-01', versions: [['Summit_W9_2025.pdf', '2025-07-01', 'Ravi Menon', '2026-07-01'], ['Summit_W9_2026.pdf', '2026-06-28', 'Ravi Menon', '2027-07-01']] });
const rv = vendor['Ridgeline Talent Group'];
await doc('vendor', rv, 'MSA', { from: '2026-11-01', to: '2028-10-31', file: 'Ridgeline_MSA.pdf', uploaded: '2026-11-02' });
await doc('vendor', rv, 'ACH form', { uploader: 'vendor', noDates: true }); // not uploaded yet → Incomplete in the tracker

/* ---------------- people ---------------- */
const people = [
  // name, type, vendor, role, email, phone, address, ssn, client, rate, location, start, end, status, am, docs
  ['Maya Reed', 'w2', null, 'Data Analyst', 'maya.reed@outlook.com', '(646) 555-0128', '312 W 88th St, Apt 4B, New York, NY 10024', '123452290', 'HTC', 62, 'Remote', '2026-03-02', '2027-02-26', 'active', 'Alicia Ross', [
    ['W-4', 'W4_Reed_2026.pdf', 'Mar 2, 2026', null, 'resource'], ['I-9', null, null, null, 'resource'], ['Employment contract', 'Reed_Employment_Contract.pdf', 'Feb 24, 2026', 'Feb 26, 2027'], ['ACH form', 'Reed_ACH.pdf', 'Mar 2, 2026', null, 'resource', true]]],
  ['Alex Morgan', 'w2', null, 'Business Intelligence Developer', 'alex.morgan@gmail.com', '(646) 555-0172', '88 Leonard St, Apt 12C, New York, NY 10013', '234566604', 'HTC', 68, 'New York, NY', '2026-05-04', '2027-05-03', 'active', 'Alicia Ross', [
    ['W-4', 'W4_Morgan_2026.pdf', 'May 1, 2026', null, 'resource'], ['I-9', 'Morgan_I9.pdf', 'May 1, 2026', null, 'resource'], ['Employment contract', 'Morgan_Employment_Contract.pdf', 'Apr 28, 2026', 'May 3, 2027'], ['ACH form', 'Morgan_ACH.pdf', 'May 1, 2026', null, 'resource', true]]],
  ['Grace Liu', 'w2', null, 'Cloud Engineer', 'grace.liu@outlook.com', '(617) 555-0149', '45 Province St, Unit 2304, Boston, MA 02108', '345673187', 'Persistent', 74, 'Boston, MA', '2026-08-03', '2027-08-02', 'active', 'Alicia Ross', [
    ['W-4', 'W4_Liu_2026.pdf', 'Jul 30, 2026', null, 'resource'], ['I-9', 'Liu_I9.pdf', 'Jul 30, 2026', null, 'resource'], ['Employment contract', 'Liu_Employment_Contract.pdf', 'Jul 27, 2026', 'Aug 2, 2027'], ['ACH form', null, null, null, 'resource', true]]],
  ['Jordan Blake', 'w1099', null, 'UX Consultant', 'jordan@blakeux.studio', '(415) 555-0186', '2201 Mission St, Suite 5, San Francisco, CA 94110', '456787731', 'HTC', 90, 'Remote', '2026-07-06', '2027-01-08', 'active', 'Alicia Ross', [
    ['1099 contract', 'Blake_1099_HTC.pdf', 'Jul 1, 2026', 'Jan 8, 2027'], ['W-9', 'Blake_W9_2026.pdf', 'Jun 30, 2026', null, 'resource'], ['I-9', null, null, null, 'resource'], ['ACH form', 'Blake_ACH.pdf', 'Jun 30, 2026', null, 'resource', true]]],
  ['Ava Chen', 'w1099', null, 'Mobile Developer', 'ava@chendev.io', '(206) 555-0133', '1201 2nd Ave, Suite 900, Seattle, WA 98101', '567895520', 'HTC', 86, 'Remote', '2026-06-01', '2026-12-18', 'active', 'Alicia Ross', [
    ['1099 contract', 'Chen_1099_HTC.pdf', 'May 27, 2026', 'Dec 18, 2026'], ['W-9', 'Chen_W9_2026.pdf', 'May 27, 2026', null, 'resource'], ['ACH form', 'Chen_ACH.pdf', 'May 27, 2026', null, 'resource', true]]],
  ['Noah Patel', 'w1099', null, 'Security Consultant', 'noah@patelsec.com', '(312) 555-0190', '233 S Wacker Dr, Suite 4100, Chicago, IL 60606', '678908842', 'Citus Tech', 95, 'Chicago, IL', '2026-09-01', '2027-02-26', 'active', 'Benjamin Cole', [
    ['1099 contract', 'Patel_1099_CitusTech.pdf', 'Aug 26, 2026', 'Feb 26, 2027'], ['W-9', 'Patel_W9_2026.pdf', 'Aug 26, 2026', null, 'resource'], ['ACH form', 'Patel_ACH.pdf', 'Aug 26, 2026', null, 'resource', true]]],
  ['Deepa Kumar', 'consultant', 'Coral Staffing LLC', 'Business Analyst', 'deepa.kumar@coralstaffing.com', '(512) 555-0147', null, null, 'Persistent', 80, 'Boston, MA', '2026-01-12', '2026-12-31', 'active', 'Alicia Ross', [
    ['Resume', 'Deepa_Kumar_Resume.pdf', 'Jan 5, 2026', null, 'staff', true], ['Work authorization (H-1B)', 'Kumar_H1B_Approval.pdf', 'Dec 1, 2025', 'Nov 30, 2026'], ['I-9', 'Kumar_I9.pdf', 'Jan 9, 2026', 'Dec 31, 2026'],
    ['Audit report', 'Kumar_Audit_Jul-Dec26.pdf', 'Jul 3, 2026', 'Dec 31, 2026', 'staff', false, 'Jul 1, 2026 – Dec 31, 2026 (6 months)', 1], ['E-Verify document', 'Kumar_EVerify.pdf', 'Jan 9, 2026', 'Dec 31, 2026']]],
  ['Rinaldo Silva', 'consultant', 'Coral Staffing LLC', 'QA Engineer', 'rinaldo.silva@coralstaffing.com', '(512) 555-0163', null, null, 'Citus Tech', 72, 'Remote', '2026-09-14', '2027-03-12', 'active', 'Benjamin Cole', [
    ['Resume', 'Rinaldo_Silva_Resume.pdf', 'Sep 1, 2026', null, 'staff', true], ['Work authorization (Green Card)', 'Silva_GC.pdf', 'Sep 1, 2026', 'Aug 14, 2033'], ['I-9', 'Silva_I9.pdf', 'Sep 10, 2026', 'Mar 12, 2027'],
    ['Audit report', 'Silva_Audit_Sep-Dec26.pdf', 'Sep 15, 2026', 'Dec 13, 2026', 'staff', false, 'Sep 14, 2026 – Dec 13, 2026 (3 months)', 0], ['E-Verify document', 'Silva_EVerify.pdf', 'Sep 10, 2026', 'Mar 12, 2027']]],
  ['Kevin Singh', 'consultant', 'Summit IT Solutions', 'Java Developer', 'kevin.singh@summitits.com', '(732) 555-0119', null, null, 'Persistent', 85, 'Boston, MA', '2026-04-01', '2027-03-31', 'active', 'Alicia Ross', [
    ['Resume', 'Kevin_Singh_Resume.pdf', 'Mar 20, 2026', null, 'staff', true], ['Work authorization (EAD)', 'Singh_EAD.pdf', 'Mar 20, 2026', 'Jun 30, 2027'], ['I-9', 'Singh_I9.pdf', 'Mar 28, 2026', 'Mar 31, 2027'],
    ['Audit report', 'Singh_Audit_Q4-26.pdf', 'Oct 2, 2026', 'Dec 31, 2026', 'staff', false, 'Oct 1, 2026 – Dec 31, 2026 (3 months)', 2], ['E-Verify document', 'Singh_EVerify.pdf', 'Mar 28, 2026', 'Mar 31, 2027']]],
  ['Omar Haddad', 'consultant', 'Coral Staffing LLC', 'DevOps Engineer', 'omar.haddad@coralstaffing.com', '(512) 555-0152', null, null, 'Persistent', 84, 'Chicago, IL', '2026-02-02', '2027-01-29', 'active', 'Alicia Ross', [
    ['Resume', 'Omar_Haddad_Resume.pdf', 'Jan 20, 2026', null, 'staff', true], ['Work authorization (Green Card)', 'Haddad_GC.pdf', 'Jan 20, 2026', 'Mar 3, 2034'], ['I-9', 'Haddad_I9.pdf', 'Jan 28, 2026', 'Jan 29, 2027'],
    ['Audit report', 'Haddad_Audit_Aug26-Jan27.pdf', 'Aug 3, 2026', 'Jan 31, 2027', 'staff', false, 'Aug 1, 2026 – Jan 31, 2027 (6 months)', 1], ['E-Verify document', 'Haddad_EVerify.pdf', 'Jan 28, 2026', 'Jan 29, 2027']]],
  ['Sofia Marin', 'consultant', 'Coral Staffing LLC', 'Scrum Master', 'sofia.marin@coralstaffing.com', '(512) 555-0188', null, null, 'Citus Tech', 76, 'Remote', '2026-05-04', '2026-11-27', 'active', 'Alicia Ross', [
    ['Resume', 'Sofia_Marin_Resume.pdf', 'Apr 22, 2026', null, 'staff', true], ['Work authorization (TN)', 'Marin_TN_Approval.pdf', 'Apr 22, 2026', 'Apr 30, 2029'], ['I-9', 'Marin_I9.pdf', 'Apr 30, 2026', 'Nov 27, 2026'],
    ['Audit report', 'Marin_Audit_Nov26-Jan27.pdf', 'Nov 2, 2026', 'Jan 31, 2027', 'staff', false, 'Nov 1, 2026 – Jan 31, 2027 (3 months)', 2], ['E-Verify document', null, null, null]]],
  ['Priya Shah', 'consultant', 'Coral Staffing LLC', 'Data Engineer', 'priya.shah@coralstaffing.com', '(512) 555-0174', null, null, 'Citus Tech', 88, 'Remote', '2026-11-16', '2027-05-14', 'onboarding', 'Alicia Ross', [
    ['Resume', 'Priya_Shah_Resume.pdf', 'Nov 9, 2026', null, 'staff', true], ['Work authorization (H-1B)', 'Shah_H1B_Approval.pdf', 'Nov 9, 2026', 'Oct 1, 2028'], ['I-9', null, null, null], ['Audit report', null, null, null], ['E-Verify document', null, null, null]]],
  ['Marcus Lee', 'consultant', 'Coral Staffing LLC', 'Salesforce Developer', 'marcus.lee@coralstaffing.com', '(512) 555-0193', null, null, null, 92, 'San Francisco, CA', '2026-12-07', '2027-06-04', 'onboarding', 'Alicia Ross', [
    ['Resume', 'Marcus_Lee_Resume.pdf', 'Nov 12, 2026', null, 'staff', true], ['I-9', null, null, null], ['E-Verify document', null, null, null], ['Audit report', null, null, null]]],
  ['Elena Petrova', 'consultant', 'Coral Staffing LLC', 'Front-end Developer', 'elena.petrova@coralstaffing.com', '(512) 555-0121', null, null, 'Citus Tech', 78, 'Remote', '2026-06-01', '2027-05-28', 'active', 'Alicia Ross', [
    ['Resume', 'Elena_Petrova_Resume.pdf', 'May 20, 2026', null, 'staff', true], ['I-9', 'Petrova_I9.pdf', 'May 28, 2026', 'May 28, 2027'], ['E-Verify document', 'Petrova_EVerify.pdf', 'May 28, 2026', 'May 28, 2027']]],
  ['Lena Fischer', 'consultant', 'Summit IT Solutions', 'SAP Consultant', 'lena.fischer@summitits.com', '(732) 555-0144', null, null, 'Persistent', 82, 'Remote', '2026-03-02', '2027-02-26', 'active', 'Alicia Ross', [
    ['Resume', 'Lena_Fischer_Resume.pdf', 'Feb 20, 2026', null, 'staff', true], ['I-9', 'Fischer_I9.pdf', 'Feb 26, 2026', 'Feb 26, 2027']]],
  ['Ravi Menon', 'consultant', 'Cascade Data Partners', 'Data Architect', 'ravi.menon@cascadedata.io', '(206) 555-0177', null, null, 'HTC', 96, 'Seattle, WA', '2026-04-06', '2027-04-02', 'active', 'Alicia Ross', [
    ['Resume', 'Ravi_Menon_Resume.pdf', 'Mar 30, 2026', null, 'staff', true], ['I-9', 'Menon_I9.pdf', 'Apr 2, 2026', 'Apr 2, 2027']]],
  ['Ana Torres', 'consultant', 'BluePeak Consulting Inc.', 'ERP Analyst', 'ana.torres@bluepeakconsulting.com', '(303) 555-0155', null, null, 'Persistent', 88, 'Denver, CO', '2026-02-16', '2027-02-12', 'active', 'Benjamin Cole', [
    ['Resume', 'Ana_Torres_Resume.pdf', 'Feb 9, 2026', null, 'staff', true], ['I-9', 'Torres_I9.pdf', 'Feb 12, 2026', 'Feb 12, 2027'], ['E-Verify document', null, null, null, 'staff', false, null, 0, true]]]
];
const person = {};
for (const [name, type, v, role, email, phone, address, ssn, cl, rate, loc, start, end, status, am, docs] of people) {
  const p = ok(await sb.from('people').insert({
    type, full_name: name, email, phone, address, ssn_last4: ssn ? ssn.slice(-4) : null, ssn_enc: ssn ? encrypt(ssn) : null,
    vendor_id: v ? vendor[v] : null, status, role_title: role, client_id: cl ? client[cl] : null, hourly_rate: rate,
    start_date: start, end_date: end, duration: null, work_location: loc, payment_term: 'Net 10', account_manager_id: amId[am]
  }).select().single(), `person ${name}`);
  person[name] = p.id;
  for (const [docType, file, uploaded, expires, uploader = 'staff', noDates = false, period = null, earlier = 0, na = false] of docs) {
    const up = iso(uploaded); const to = iso(expires);
    const by = uploader === 'resource' ? name : 'Alicia Ross';
    const versions = file ? [...Array(earlier).fill(0).map((_, i) => [file.replace('.pdf', `_prev${i + 1}.pdf`), addDays(up, -90 * (earlier - i)), 'Alicia Ross', addDays(up, -1)]), [file, up, by, to]] : [];
    await doc('person', p.id, docType, { uploader, noDates, from: noDates ? null : up, to, period, versions, na });
  }
}
// Logins for W-2 / 1099 resources and (for the Sign-in section) consultants
const personLogins = [
  ['maya.reed@outlook.com', 'Maya Reed', { set: '2026-10-30' }], ['jordan@blakeux.studio', 'Jordan Blake', { set: '2026-10-20' }],
  ['alex.morgan@gmail.com', 'Alex Morgan', {}], ['grace.liu@outlook.com', 'Grace Liu', {}], ['ava@chendev.io', 'Ava Chen', {}], ['noah@patelsec.com', 'Noah Patel', {}],
  ['kevin.singh@summitits.com', 'Kevin Singh', { set: '2026-10-12' }], ['deepa.kumar@coralstaffing.com', 'Deepa Kumar', {}]
];
for (const [email, name, extra] of personLogins) await account(email, name, 'resource', { ...extra, person_id: person[name] });

/* ---------------- submissions and client invoices ---------------- */
const OCT = '2026-10-01', SEP = '2026-09-01', AUG = '2026-08-01';
async function submission(ref, name, period, hours, status, files, extra = {}) {
  const p = people.find((r) => r[0] === name);
  const rate = p[9];
  const w2 = p[1] === 'w2';
  const sub = { ref, person_id: person[name], client_id: client[p[8]], period, hours, hourly_rate: rate, amount: w2 ? null : Math.round(hours * rate * 100) / 100, status, ...extra };
  if (files.invoice) { sub.invoice_name = files.invoice; sub.invoice_path = await upload(`submissions/${person[name]}/${period}`, files.invoice); }
  if (files.timesheet) { sub.timesheet_name = files.timesheet; sub.timesheet_path = await upload(`submissions/${person[name]}/${period}`, files.timesheet); }
  ok(await sb.from('submissions').insert(sub), `submission ${ref}`);
}
const rej = (reason, by = alicia) => ({ reject_reason: reason, reviewed_by: by, reviewed_at: '2026-11-06T16:00:00Z' });
const appr = (by = alicia) => ({ reviewed_by: by, reviewed_at: '2026-11-05T16:00:00Z' });
await submission('INV-2026-10-0142', 'Rinaldo Silva', OCT, 168, 'approved', { invoice: 'CS-INV-10482.pdf', timesheet: 'Silva_Oct26_timesheet.pdf' }, { ...appr(ben), submitted_at: '2026-11-04T15:00:00Z', version_no: 2 });
await submission('INV-2026-10-0151', 'Jordan Blake', OCT, 152, 'in_progress', { invoice: 'BlakeUX-0046.pdf', timesheet: 'Blake_HTC_Oct26.pdf' }, { submitted_at: '2026-11-02T15:00:00Z' });
await submission('INV-2026-10-0187', 'Kevin Singh', OCT, 160, 'rejected', { invoice: 'SIT-INV-2210.pdf', timesheet: 'Singh_Oct26_timesheet.pdf' }, { ...rej('Client approved 152 h for October; vendor invoice shows 160 h.'), submitted_at: '2026-11-03T15:00:00Z' });
await submission('TS-2026-10-0093', 'Maya Reed', OCT, 168, 'approved', { timesheet: 'Reed_Oct26.pdf' }, { ...appr(), submitted_at: '2026-11-02T15:00:00Z' });
await submission('INV-2026-10-0203', 'Deepa Kumar', OCT, 160, 'rejected', { invoice: 'CS-INV-10477.pdf', timesheet: 'Kumar_Oct26_timesheet.pdf' }, { ...rej('Vendor billed 160 h; the client invoice shows 168 h. Please update the hours and resubmit.'), submitted_at: '2026-11-03T15:00:00Z' });
await submission('INV-2026-10-0211', 'Ana Torres', OCT, 176, 'approved', { invoice: 'BP-INV-5521.pdf', timesheet: 'Torres_Oct26_timesheet.pdf' }, { ...appr(ben), submitted_at: '2026-11-04T15:00:00Z' });
await submission('INV-2026-10-0198', 'Omar Haddad', OCT, 144, 'in_progress', { invoice: 'CS-INV-10479.pdf' }, { submitted_at: '2026-11-03T15:00:00Z' });
await submission('INV-2026-10-0176', 'Sofia Marin', OCT, 168, 'in_progress', { invoice: 'CS-INV-10471.pdf', timesheet: 'Marin_Oct26_timesheet.pdf' }, { submitted_at: '2026-11-02T15:00:00Z' });
await submission('INV-2026-10-0219', 'Ravi Menon', OCT, 144, 'in_progress', { invoice: 'CD-INV-0912.pdf', timesheet: 'Menon_Oct26_timesheet.pdf' }, { submitted_at: '2026-11-03T15:00:00Z' });
await submission('TS-2026-10-0101', 'Alex Morgan', OCT, 160, 'in_progress', { timesheet: 'Morgan_Oct26.pdf' }, { submitted_at: '2026-11-02T15:00:00Z' });
await submission('TS-2026-10-0110', 'Grace Liu', OCT, 168, 'in_progress', { timesheet: 'Liu_Oct26.pdf' }, { submitted_at: '2026-11-03T15:00:00Z' });
await submission('INV-2026-10-0233', 'Noah Patel', OCT, 120, 'rejected', { invoice: 'Patel-INV-031.pdf', timesheet: 'Patel_Oct26_timesheet.pdf' }, { ...rej('Invoice shows 120 h; the client invoice shows 128 h for October.', ben), submitted_at: '2026-11-03T15:00:00Z' });
// Earlier months (history)
await submission('TS-2026-09-0071', 'Maya Reed', SEP, 160, 'approved', { timesheet: 'Reed_Sep26_v2.pdf' }, { ...appr(), submitted_at: '2026-10-02T15:00:00Z' });
await submission('INV-2026-09-0388', 'Jordan Blake', SEP, 160, 'approved', { invoice: 'BlakeUX-0039.pdf', timesheet: 'Blake_HTC_Sep26.pdf' }, { ...appr(), submitted_at: '2026-10-04T15:00:00Z' });
await submission('INV-2026-08-0301', 'Jordan Blake', AUG, 168, 'approved', { invoice: 'BlakeUX-0035.pdf', timesheet: 'Blake_HTC_Aug26.pdf' }, { ...appr(), submitted_at: '2026-09-02T15:00:00Z' });
await submission('INV-2026-09-0145', 'Deepa Kumar', SEP, 168, 'approved', { invoice: 'CS-INV-10391.pdf', timesheet: 'Kumar_Sep26_timesheet.pdf' }, { ...appr(), submitted_at: '2026-10-03T15:00:00Z' });
await submission('INV-2026-09-0133', 'Rinaldo Silva', SEP, 96, 'approved', { invoice: 'CS-INV-10388.pdf', timesheet: 'Silva_Sep26_timesheet.pdf' }, { ...appr(ben), submitted_at: '2026-10-03T15:00:00Z' });
await submission('INV-2026-09-0129', 'Kevin Singh', SEP, 168, 'approved', { invoice: 'SIT-INV-2190.pdf', timesheet: 'Singh_Sep26_timesheet.pdf' }, { ...appr(), submitted_at: '2026-10-02T15:00:00Z' });

async function clientInvoice(name, period, hours, file) {
  const p = people.find((r) => r[0] === name);
  const path = await upload(`client-invoices/${client[p[8]]}/${period}`, file);
  ok(await sb.from('client_invoices').insert({ client_id: client[p[8]], person_id: person[name], period, hours, file_path: path, file_name: file, uploaded_by: alicia, uploaded_at: `${addDays(period, 33)}T15:00:00Z` }), `CI ${name}`);
}
for (const [name, hours, file] of [
  ['Deepa Kumar', 168, 'PER-Oct26-Kumar.pdf'], ['Kevin Singh', 152, 'PER-Oct26-Singh.pdf'], ['Rinaldo Silva', 168, 'CT-Oct26-Silva.pdf'], ['Ana Torres', 176, 'PER-Oct26-Torres.pdf'],
  ['Ravi Menon', 144, 'HTC-Oct26-Menon.pdf'], ['Lena Fischer', 168, 'PER-Oct26-Fischer.pdf'], ['Elena Petrova', 160, 'CT-Oct26-Petrova.pdf'], ['Maya Reed', 168, 'HTC-Oct26-Maya.pdf'],
  ['Alex Morgan', 160, 'HTC-Oct26-Morgan.pdf'], ['Ava Chen', 160, 'HTC-Oct26-Chen.pdf'], ['Noah Patel', 128, 'CT-Oct26-Patel.pdf']
]) await clientInvoice(name, OCT, hours, file);
for (const [name, hours] of [['Deepa Kumar', 168], ['Kevin Singh', 168], ['Rinaldo Silva', 96], ['Maya Reed', 160], ['Jordan Blake', 160], ['Omar Haddad', 160], ['Sofia Marin', 168], ['Ana Torres', 168], ['Alex Morgan', 168], ['Lena Fischer', 160]]) {
  await clientInvoice(name, SEP, hours, `${name.split(' ').pop()}_Sep26_client.pdf`);
}
await clientInvoice('Jordan Blake', AUG, 168, 'HTC-Aug26-Blake.pdf');

/* ---------------- activity ---------------- */
const log = [
  ['Alicia Ross', 'account_manager', 'reject', 'submission', 'rejected INV-2026-10-0203 (Deepa Kumar) — 160 h submitted vs. 168 h on client invoice', '2026-11-06T16:00:00Z'],
  ['Daniel Ortiz', 'vendor', 'upload', 'document', 'uploaded COI renewal for Coral Staffing LLC', '2026-11-05T14:00:00Z'],
  ['Alicia Ross', 'account_manager', 'create', 'person', 'created Priya Shah (consultant · Coral Staffing LLC) and sent login details', '2026-11-09T15:30:00Z'],
  ['Benjamin Cole', 'account_manager', 'approve', 'submission', 'approved INV-2026-10-0142 (Rinaldo Silva)', '2026-11-05T16:00:00Z'],
  ['Arun Krishnan', 'super_admin', 'update', 'document', 'renewed MSA for Citus Tech through Jan 30, 2028', '2026-11-12T18:00:00Z'],
  ['Maya Reed', 'resource', 'submit', 'submission', 'submitted October timesheet (168 h)', '2026-11-02T15:00:00Z']
];
for (const [actor_name, actor_role, action, entity, summary, at] of log) ok(await sb.from('audit_log').insert({ actor_name, actor_role, action, entity, summary, at }), 'audit');

console.log(`Seeded: ${Object.keys(accounts).length} accounts, ${clientRows.length} clients, ${Object.keys(vendor).length} vendors, ${Object.keys(person).length} people, ${fileNo} files.`);
