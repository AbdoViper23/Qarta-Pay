import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAddress, verifyMessage, type Address, type Hex } from 'viem';
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import type { Db } from '../db/pool';

/**
 * Sign-In with Ethereum (EIP-4361), used only to reveal gift card codes and list history.
 * The session is a short-lived bearer token: "<wallet>.<expiry>.<hmac>" signed with
 * SESSION_SECRET. Nonces are single-use and expire after 10 minutes.
 */

const NONCE_TTL_S = 600;
const SESSION_TTL_S = 30 * 60;

export async function issueNonce(db: Db): Promise<string> {
  const nonce = generateSiweNonce();
  await db.query('insert into auth_nonce (nonce) values ($1)', [nonce]);
  return nonce;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Verifies a signed SIWE message and returns a session token for its address. */
export async function verifySignIn(
  db: Db,
  input: { message: string; signature: Hex },
  expected: { domain: string; chainId: number; secret: string },
  now = new Date(),
): Promise<{ token: string; address: Address; expiresAt: Date }> {
  const fields = parseSiweMessage(input.message);
  if (!fields.address || !fields.nonce) throw new AuthError('malformed message');
  if (fields.chainId !== expected.chainId) throw new AuthError('wrong chain');
  const valid = validateSiweMessage({ message: fields, domain: expected.domain, time: now });
  if (!valid) throw new AuthError('message is expired or for another domain');
  if (
    !(await verifyMessage({
      address: fields.address,
      message: input.message,
      signature: input.signature,
    }))
  ) {
    throw new AuthError('bad signature');
  }
  // Consume the nonce; it must exist, be fresh and unused.
  const used = await db.query(
    `update auth_nonce set used_at = now()
      where nonce = $1 and used_at is null and created_at > now() - make_interval(secs => $2)`,
    [fields.nonce, NONCE_TTL_S],
  );
  if (used.rowCount !== 1) throw new AuthError('unknown, used or expired nonce');

  const address = getAddress(fields.address);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_S * 1000);
  return { token: signSession(address, expiresAt, expected.secret), address, expiresAt };
}

function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function signSession(address: Address, expiresAt: Date, secret: string): string {
  const payload = `${address.toLowerCase()}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${payload}.${mac(payload, secret)}`;
}

/** Returns the wallet of a valid, unexpired session token, else null. */
export function readSession(
  token: string | undefined,
  secret: string,
  now = new Date(),
): Address | null {
  if (!token) return null;
  const [address, expiry, signature] = token.split('.');
  if (!address || !expiry || !signature) return null;
  const expected = Buffer.from(mac(`${address}.${expiry}`, secret), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(expiry) * 1000 < now.getTime()) return null;
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}
