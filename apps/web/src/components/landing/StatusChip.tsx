import { STATUS_LABEL, type PhaseStatus } from '@/lib/roadmap';

const STYLE: Record<PhaseStatus, string> = {
  live: 'border-ok bg-ok text-surface',
  next: 'border-brand text-brand',
  planned: 'border-ink/40 text-muted',
};

export function StatusChip({ status }: { status: PhaseStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border-2 px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${STYLE[status]}`}
    >
      {status === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-surface" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
