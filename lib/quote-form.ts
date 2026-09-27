export const QUOTE_BUDGET_OPTIONS = [
  { value: "", label: "Ще не визначились" },
  { value: "500", label: "до $500" },
  { value: "1500", label: "$500–1500" },
  { value: "5000", label: "$1500–5000" },
  { value: "10000", label: "понад $5000" },
] as const;

export type QuoteFormField = "company" | "email" | "taskDescription" | "budget";

export type QuoteFormData = {
  company: string;
  email: string;
  taskDescription: string;
  budget: number | null;
};

// Raw, as-typed field values (budget kept as the submitted string, even if it
// doesn't match a valid option) -- for repopulating the form via defaultValue
// after a validation error, per the building-client-form skill's contract.
export type QuoteFormValues = {
  company: string;
  email: string;
  taskDescription: string;
  budget: string;
};

export type QuoteParseResult =
  | { ok: true; data: QuoteFormData }
  | { ok: false; errors: Partial<Record<QuoteFormField, string>>; values: QuoteFormValues };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, name: QuoteFormField, max = 200) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseQuoteForm(formData: FormData): QuoteParseResult {
  const data: QuoteFormData = {
    company: text(formData, "company", 120),
    email: text(formData, "email", 200).toLowerCase(),
    taskDescription: text(formData, "taskDescription", 2000),
    budget: null,
  };

  const errors: Partial<Record<QuoteFormField, string>> = {};

  if (!data.company) errors.company = "Вкажіть назву компанії";
  if (!EMAIL_RE.test(data.email)) errors.email = "Перевірте email";
  if (data.taskDescription.length < 10) errors.taskDescription = "Опишіть задачу хоча б одним реченням";

  const budget = text(formData, "budget", 10);
  if (budget) {
    if (!QUOTE_BUDGET_OPTIONS.some((option) => option.value === budget)) {
      errors.budget = "Оберіть бюджет зі списку";
    } else {
      data.budget = Number(budget);
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values: { company: data.company, email: data.email, taskDescription: data.taskDescription, budget },
    };
  }
  return { ok: true, data };
}
