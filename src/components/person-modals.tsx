// Person pop-ups shared by Vendors, W-2 Resources, 1099 Resources and the vendor's Consultants page.
import { Modal, ModalClose } from './client';
import { InvoiceHistory, PersonView, signInInfo, visibleDocs } from './people';
import { PersonForm } from './PersonForm';
import { db, must } from '@/lib/supabase/admin';
import { canSeePerson, canSeeVendor, isStaff, type Session } from '@/lib/session';
import { clientsInScope, docsFor, getPerson, maps, paymentTerms } from '@/lib/data';
import { maskSsn } from '@/lib/crypto';

export async function personModal(sp: Record<string, string>, s: Session, closeHref: string): Promise<React.ReactNode> {
  const staff = isStaff(s);
  // Add Consultant (from a vendor row) / Add W-2 Resource / Add 1099 Resource
  if (sp.m === 'add-consultant' || sp.m === 'add-w2' || sp.m === 'add-1099') {
    if (!staff) return null;
    const type = sp.m === 'add-consultant' ? 'consultant' : sp.m === 'add-w2' ? 'w2' : 'w1099';
    let vendor = null;
    if (type === 'consultant') {
      if (!sp.vendor || !canSeeVendor(s, sp.vendor)) return null;
      const v = must(await db().from('vendors').select('id,name,payment_term,contact_name,email').eq('id', sp.vendor).single(), 'vendor') as { id: string; name: string; payment_term: string; contact_name: string; email: string };
      vendor = { id: v.id, name: v.name, payment_term: v.payment_term, contact: `${v.contact_name} · ${v.email}` };
    }
    const clients = (await clientsInScope(s)).filter((c) => c.status === 'active').map((c) => ({ value: c.id, label: c.name }));
    const title = type === 'consultant' ? `Add Consultant · ${vendor!.name}` : type === 'w2' ? 'Add W-2 Resource' : 'Add 1099 Resource';
    const desc = type === 'consultant'
      ? 'Add a consultant for this vendor and their first client assignment. Only account managers and the Super Admin add vendor consultants. Consultants do not sign in; their vendor submits their invoices and timesheets.'
      : `Add a ${type === 'w2' ? 'W-2 employee' : '1099 contractor'} with personal, assignment and payment details.`;
    return (
      <Modal title={title} description={desc} closeHref={closeHref}>
        <PersonForm mode="add" type={type} data={{ payment_term: 'Net 10', work_location: 'Remote' }} vendor={vendor} clients={clients} terms={await paymentTerms()} back={closeHref} cancelHref={closeHref} />
      </Modal>
    );
  }
  if (!['view-person', 'edit-person', 'invoices'].includes(sp.m || '') || !sp.id) return null;
  const person = await getPerson(sp.id);
  if (!person || !canSeePerson(s, person)) return null;

  if (sp.m === 'view-person') {
    return (
      <Modal title={person.full_name} description="Full profile and documents on file." closeHref={closeHref}>
        <div className="modal-content"><PersonView s={s} person={person} /></div>
        <div className="form-footer modal-footer"><span /><div className="form-buttons"><ModalClose href={closeHref} primary /></div></div>
      </Modal>
    );
  }
  if (sp.m === 'invoices' && staff) {
    const m = await maps();
    return (
      <Modal title={`${person.full_name} · Invoices & timesheets`} description={`${person.vendor_id ? `${m.vendor[person.vendor_id]?.name} · ` : ''}${person.client_id ? m.client[person.client_id]?.name : 'Not mapped'}. Latest month first.`} closeHref={closeHref}>
        <div className="modal-content"><InvoiceHistory person={person} /></div>
        <div className="form-footer modal-footer"><span /><div className="form-buttons"><ModalClose href={closeHref} primary /></div></div>
      </Modal>
    );
  }
  if (sp.m === 'edit-person' && staff) {
    const m = await maps();
    const docs = visibleDocs(s, person, await docsFor('person', [person.id]));
    const vendor = person.vendor_id ? m.vendor[person.vendor_id] : null;
    const clients = (await clientsInScope(s)).map((c) => ({ value: c.id, label: c.name }));
    if (person.client_id && !clients.some((c) => c.value === person.client_id)) clients.push({ value: person.client_id, label: m.client[person.client_id]?.name || 'Current client' });
    const ams = Object.values(m.am).filter((a) => a.status !== 'inactive').map((a) => ({ value: a.id, label: a.full_name }));
    return (
      <Modal title={`Edit ${person.full_name}`} description="Update personal details, assignment and documents. Every change is recorded in the Audit Log." closeHref={closeHref}>
        <PersonForm mode="edit" type={person.type} back={closeHref} cancelHref={closeHref} terms={await paymentTerms()} clients={clients}
          vendor={vendor ? { id: vendor.id, name: vendor.name, payment_term: vendor.payment_term, contact: `${vendor.contact_name} · ${vendor.email}` } : null}
          amOptions={ams} canEditAm={s.persona === 'superadmin'} amName={person.account_manager_id ? m.am[person.account_manager_id]?.full_name : '—'}
          data={{ ...person, ssnMasked: maskSsn(person.ssn_last4) }}
          docs={docs.map((d) => ({ id: d.id, doc_type: d.doc_type, uploader_kind: d.uploader_kind, no_dates: d.no_dates, valid_from: d.valid_from, valid_to: d.valid_to,
            audit_period: d.audit_period, current: d.current ? { name: d.current.file_name, size: d.size } : null }))}
          signIn={person.type === 'consultant' ? null : await signInInfo({ personId: person.id })} />
      </Modal>
    );
  }
  return null;
}
