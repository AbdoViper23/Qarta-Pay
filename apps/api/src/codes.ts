import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Gift card codes at rest: AES-256-GCM with a random 12-byte IV per order.
 * Stored as "v1:<iv hex>:<tag hex>:<ciphertext hex>". The key never leaves the server env.
 */

export const cardCodeSchema = z.object({ code: z.string(), pin: z.string().nullable() });
export type CardCode = z.infer<typeof cardCodeSchema>;

function key(hexKey: string): Buffer {
  const buffer = Buffer.from(hexKey, 'hex');
  if (buffer.length !== 32) throw new Error('CODE_ENCRYPTION_KEY must be 32 bytes');
  return buffer;
}

export function encryptCodes(codes: CardCode[], hexKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(hexKey), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(codes), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptCodes(stored: string, hexKey: string): CardCode[] {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('unknown code format');
  const decipher = createDecipheriv('aes-256-gcm', key(hexKey), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]).toString('utf8');
  return z.array(cardCodeSchema).parse(JSON.parse(plain));
}
