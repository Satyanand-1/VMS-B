'use client';
import { startTransition, useActionState, type FormEvent } from 'react';
import type { FormState } from '@/lib/actions/auth';

// Submits a server action from onSubmit, so React does not clear the form after a validation error
// (passing the action to <form action> resets uncontrolled fields). Includes the clicked button's name/value.
export function useFormAction(action: (state: FormState, form: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(action, undefined);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter && submitter.getAttribute('name') ? submitter : undefined);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}
