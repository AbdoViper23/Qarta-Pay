/**
 * Removes secrets and personal data from a recorded supplier response before it is saved
 * as a test fixture. Fixtures are committed, so they must never hold tokens, phone numbers,
 * e-mail addresses or gift card codes (docs/11-SECURITY-AND-SECRETS.md).
 *
 * The shape of the response is kept, so a fixture still exercises the parser.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Keys whose values are always replaced, whatever their type. Compared in lower case. */
const SENSITIVE_KEYS = new Set([
  'access_token',
  'accesstoken',
  'token',
  'client_secret',
  'client_id',
  'recipientphone',
  'senderphone',
  'phonenumber',
  'phone',
  'number',
  'recipientemail',
  'email',
  'sendername',
  'cardnumber',
  'pincode',
  'pin',
  'pindetail',
  'redeemcode',
  'redemptioncode',
  'activationcode',
  'code',
  'serial',
  'redemptionurl',
  'operatortransactionid',
]);

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Replaces every leaf value and keeps only the shape. Use it for responses that exist to
 * carry secrets, such as the gift card code endpoint: its field names are not reliably
 * documented, so a key list cannot be trusted there.
 */
export function redactAll(value: Json): Json {
  return redact(value);
}

function redact(value: Json): Json {
  if (value === null) return null;
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return 'REDACTED';
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, redact(inner)]));
}

export function scrub(value: Json): Json {
  if (typeof value === 'string') return value.replace(EMAIL_PATTERN, 'REDACTED@example.com');
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrub);
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? redact(inner) : scrub(inner),
    ]),
  );
}
