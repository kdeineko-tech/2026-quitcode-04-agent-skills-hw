import Link from "next/link";
import { QuoteForm } from "@/components/quote-form";

export default function NewQuotePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Studio Nova
          </Link>
          <Link href="/login" className="text-sm text-slate-500 hover:text-slate-900">
            Вхід для команди
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-6 py-12 md:grid-cols-[1fr_1.2fr]">
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">Запит на кошторис</h1>
          <p className="text-slate-600">
            Розкажіть коротко про задачу — ми підготуємо PDF-кошторис і надішлемо посилання на
            нього на цій сторінці.
          </p>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>• Кошторис готується автоматично, зазвичай 40–90 секунд</li>
            <li>• Сторінка запиту оновиться сама, коли він буде готовий</li>
            <li>• Посилання на кошторис можна зберегти й переглянути пізніше</li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <QuoteForm />
        </section>
      </main>
    </div>
  );
}
