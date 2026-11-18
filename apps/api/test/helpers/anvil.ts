import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Abi, Hex } from 'viem';

/** anvil from PATH, or from Foundry's default install folder. */
function anvilBin(): string {
  const local = join(homedir(), '.foundry', 'bin', 'anvil');
  return process.env.ANVIL_BIN ?? (existsSync(local) ? local : 'anvil');
}

export interface Anvil {
  url: string;
  stop: () => void;
}

export async function startAnvil(): Promise<Anvil> {
  const port = 18_000 + Math.floor(Math.random() * 10_000);
  const child: ChildProcess = spawn(anvilBin(), ['--port', String(port), '--silent'], {
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (response.ok) return { url, stop: () => child.kill() };
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('anvil did not start (is Foundry installed?)');
}

/** ABI and bytecode from the Foundry build (`forge build` in contracts/). */
export function artifact(file: string, contract: string): { abi: Abi; bytecode: Hex } {
  const path = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    'contracts',
    'out',
    file,
    `${contract}.json`,
  );
  if (!existsSync(path)) throw new Error(`missing ${path}: run "forge build" in contracts/ first`);
  const json = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

/** anvil's development accounts (from its public test mnemonic). Worthless outside a local node. */
export const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
