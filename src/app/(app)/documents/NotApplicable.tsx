'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/client';
import { notApplicableAction } from '@/lib/actions/documents';
import type { FormState } from '@/lib/actions/auth';

// DOC-4: Super Admin marks a missing document Not Applicable for this owner (or removes the mark).
export function NotApplicableButton({ docId, value }: { docId: string; value: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(notApplicableAction, undefined);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => { if (state?.ok) { toast({ tone: 'success', title: state.ok }); router.refresh(); } }, [state, toast, router]);
  return (
    <form action={action}>
      <input type="hidden" name="document_id" value={docId} />
      <input type="hidden" name="value" value={String(value)} />
      <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>{value ? 'Mark Not Applicable' : 'Remove Not Applicable'}</button>
    </form>
  );
}
