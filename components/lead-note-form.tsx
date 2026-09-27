"use client";

import { useActionState, useEffect, useRef } from "react";
import { addLeadNote, type AddLeadNoteState } from "@/app/actions";

const initialState: AddLeadNoteState = { status: "idle" };
const NOTE_MAX_LENGTH = 500;

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addLeadNote, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "invalid" ? state.errors.note : undefined;

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-lg border border-slate-200 bg-white p-5 text-sm" noValidate>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="note" className="block font-medium">
        Додати нотатку
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          disabled={pending}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "note-error" : undefined}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      {error && (
        <p id="note-error" role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Зберігаємо…" : "Додати нотатку"}
      </button>
    </form>
  );
}
