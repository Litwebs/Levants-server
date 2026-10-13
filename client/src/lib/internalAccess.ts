export const LITWEBS_EMAIL_DOMAIN = "@litwebs.co.uk";

export function hasLitwebsEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  return email.trim().toLowerCase().endsWith(LITWEBS_EMAIL_DOMAIN);
}
