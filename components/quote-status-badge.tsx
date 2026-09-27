import type { QuoteStatus } from "@/lib/types";

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  queued: "Готується",
  ready: "Готово",
  failed: "Помилка",
};

const QUOTE_STATUS_STYLES: Record<QuoteStatus, string> = {
  queued: "bg-sky-50 text-sky-700 ring-sky-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${QUOTE_STATUS_STYLES[status]}`}
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
