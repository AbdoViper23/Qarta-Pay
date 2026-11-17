import { qieMainnet } from '@qarta/shared';
import { shortAddress } from '@/lib/format';

// Placeholder home page. The storefront screens arrive in Step 4 (docs/06-FRONTEND.md).
export default function HomePage() {
  return (
    <main>
      <h1>Qarta Pay</h1>
      <p>Your crypto, as good as cash.</p>
      <p>
        Network: {qieMainnet.name} (chain {qieMainnet.id}). Example address:{' '}
        {shortAddress('0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5')}
      </p>
    </main>
  );
}
