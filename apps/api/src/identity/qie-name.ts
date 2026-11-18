import { qieNameRegistryAbi, qieReverseResolverAbi } from '@qarta/shared';
import type { Address, PublicClient } from 'viem';

/**
 * Wallet → `.qie` name (docs/07-QIE-REFERENCE.md). Read order:
 *   1. reverse resolver `resolve(address)`   (stale for names registered after mid-2026)
 *   2. registry B `userDomain(address)`        (covers names held in registry B)
 * Returns null when neither knows a name or a call fails. Names are display-only: they never
 * gate payments, refunds, limits or code reveal.
 */
export async function resolveQieName(
  client: PublicClient,
  wallet: Address,
  resolver: Address | null,
  registryB: Address | null,
): Promise<string | null> {
  const attempts: (() => Promise<string>)[] = [];
  if (resolver) {
    attempts.push(() =>
      client.readContract({
        address: resolver,
        abi: qieReverseResolverAbi,
        functionName: 'resolve',
        args: [wallet],
      }),
    );
  }
  if (registryB) {
    attempts.push(() =>
      client.readContract({
        address: registryB,
        abi: qieNameRegistryAbi,
        functionName: 'userDomain',
        args: [wallet],
      }),
    );
  }
  for (const attempt of attempts) {
    try {
      const name = normaliseQieName(await attempt());
      if (name) return name;
    } catch {
      // A failed lookup only means "no name to show"; try the next source.
    }
  }
  return null;
}

/** Accepts a plain name made of printable characters; returns it as `name.qie`, else null. */
export function normaliseQieName(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  if (name === '' || name.length > 64) return null;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) return null;
  return name.endsWith('.qie') ? name : `${name}.qie`;
}
