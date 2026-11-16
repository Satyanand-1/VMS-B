// Password rule for every password set in the app (first sign-in, change, new password from an admin, invite):
// 8–72 characters (72 is the hashing limit), no spaces, at least one letter and one number.
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 72) return 'Use at most 72 characters.';
  if (/\s/.test(pw)) return 'The password cannot contain spaces.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  return null;
}
