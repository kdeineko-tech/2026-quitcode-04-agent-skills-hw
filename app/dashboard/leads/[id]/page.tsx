import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadActions } from "@/components/lead-actions";
import { LeadNoteForm } from "@/components/lead-note-form";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";

const dateTimeFormat = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });
const usd = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function LeadPage({ params }: PageProps<"/dashboard/leads/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const [workspace, lead] = await Promise.all([
    getWorkspace({ slug: user.workspaceSlug }),
    getLead(id),
  ]);

  if (!lead || lead.workspaceId !== workspace.id) notFound();

  const details: Array<[string, string]> = [
    ["Email", lead.email],
    ["Телефон", lead.phone || "—"],
    ["Компанія", lead.company || "—"],
    ["Посада", lead.jobTitle || "—"],
    ["Сайт", lead.website || "—"],
    ["Місто", [lead.city, lead.country].filter(Boolean).join(", ") || "—"],
    ["Джерело", [lead.source, lead.utmCampaign].filter(Boolean).join(" · ")],
    ["Бюджет", lead.budget === null ? "—" : `${usd.format(lead.budget)} / міс.`],
    ["Відповідальний", lead.assignedTo ?? "не призначено"],
    ["Створено", dateTimeFormat.format(new Date(lead.createdAt))],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
        ← Усі ліди
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{lead.fullName}</h1>
          <p className="text-sm text-slate-500">
            {lead.id} · оцінка {lead.score}/100
          </p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <h2 className="font-medium">Повідомлення</h2>
        <p className="whitespace-pre-line text-slate-700">{lead.message}</p>
      </section>

      {lead.internalNotes && (
        <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm">
          <h2 className="font-medium">Внутрішні нотатки</h2>
          <p className="text-slate-700">{lead.internalNotes}</p>
        </section>
      )}

      <LeadActions leadId={lead.id} status={lead.status} />

      <LeadNoteForm leadId={lead.id} />
    </div>
  );
}
