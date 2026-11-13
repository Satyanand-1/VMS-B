'use client';
import { useFormAction } from '@/components/useFormAction';
import { FormFooter, Section, Text } from '@/components/fields';
import { changePassword } from '@/lib/actions/auth';

export function ChangePasswordForm({ hint }: { hint: string }) {
  const [state, action, pending] = useFormAction(changePassword);
  const fe = state?.fieldErrors;
  return (
    <form className="form-card" onSubmit={action}>
      <Section title="Change password" hint={hint}>
        <Text name="current" label="Current password" type="password" required autoComplete="current-password" errors={fe} />
        <Text name="password" label="New password" type="password" required autoComplete="new-password" placeholder="At least 8 characters" note="Must be different from your current password." errors={fe} />
        <Text name="confirm" label="Confirm new password" type="password" required autoComplete="new-password" errors={fe} />
      </Section>
      <FormFooter cancelHref="/dashboard" submitLabel="Change Password" pending={pending} error={state?.error} />
    </form>
  );
}
