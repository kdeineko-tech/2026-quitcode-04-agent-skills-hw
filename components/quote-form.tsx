"use client";

import { useActionState } from "react";
import { submitQuoteRequest, type SubmitQuoteRequestState } from "@/app/quotes/actions";
import { QUOTE_BUDGET_OPTIONS } from "@/lib/quote-form";

const initialState: SubmitQuoteRequestState = { status: "idle" };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function QuoteForm() {
  const [state, formAction, pending] = useActionState(submitQuoteRequest, initialState);
  const errors = state.status === "invalid" ? state.errors : {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <label className="block text-sm font-medium">
        Компанія
        <input name="company" autoComplete="organization" className={inputClass} />
        {errors.company && <span className="mt-1 block text-xs text-red-600">{errors.company}</span>}
      </label>

      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="email" className={inputClass} />
        {errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email}</span>}
      </label>

      <label className="block text-sm font-medium">
        Опис задачі
        <textarea name="taskDescription" rows={4} className={inputClass} />
        {errors.taskDescription && (
          <span className="mt-1 block text-xs text-red-600">{errors.taskDescription}</span>
        )}
      </label>

      <label className="block text-sm font-medium">
        Бюджет
        <select name="budget" defaultValue="" className={inputClass}>
          {QUOTE_BUDGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.budget && <span className="mt-1 block text-xs text-red-600">{errors.budget}</span>}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Надсилаємо…" : "Надіслати запит на кошторис"}
      </button>
    </form>
  );
}
