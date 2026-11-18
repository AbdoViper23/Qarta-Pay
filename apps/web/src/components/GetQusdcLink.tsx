import { env } from '@/lib/env';

/** "Get QUSDC" opens the QIEDex swap page (docs/06-FRONTEND.md). */
export function GetQusdcLink({ label = 'Get QUSDC on QIEDex' }: { label?: string }) {
  return (
    <a
      href={env.qiedexSwapUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-semibold text-brand underline underline-offset-2"
    >
      {label} ↗
    </a>
  );
}
