// Validates the model's answer. The model is untrusted, so:
//   1. parseModelOutput: the JSON must have exactly the expected field types, or it's rejected.
//      Unknown fields like "decision" are dropped and reported.
//   2. buildDraft: a merchant or amount that isn't in the student's text is thrown out, and
//      the missing-fields list is worked out here instead of trusting the model's.
// Category is NOT checked against the text: it's the model's guess from a fixed list.
// The draft only pre-fills a form for a person to review.

export const DRAFT_CATEGORIES = [
  "books",
  "groceries",
  "transport",
  "dining",
  "personal",
  "social",
  "subscriptions",
] as const;

/** Sent to Ollama, which constrains the model's output to this shape. */
export const MODEL_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    merchant: { type: ["string", "null"] },
    amount_dollars: { type: ["number", "null"] },
    category: { enum: [...DRAFT_CATEGORIES, null] },
    purpose: { type: ["string", "null"] },
    missing_information: { type: "array", items: { type: "string" } },
  },
  required: ["merchant", "amount_dollars", "category", "purpose", "missing_information"],
  additionalProperties: false,
} as const;

const KNOWN_FIELDS = new Set(Object.keys(MODEL_OUTPUT_SCHEMA.properties));
const MAX_TEXT_LENGTH = 200;
const MAX_AMOUNT_CENTS = 100_000_000;

export interface ProposalDraft {
  merchant: string | null;
  amountCents: number | null;
  category: string | null;
  purpose: string | null;
  /** Calculated here, not taken from the model. */
  missingInformation: ("merchant" | "amount" | "category")[];
  readyForProposal: boolean;
}

export type ParsedOutput =
  | { ok: true; fields: ModelFields; ignoredFields: string[] }
  | { ok: false; errors: string[] };

export interface ModelFields {
  merchant: string | null;
  amount_dollars: number | null;
  category: string | null;
  purpose: string | null;
  missing_information: string[];
}

export function parseModelOutput(raw: string): ParsedOutput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ["The model's response was not valid JSON."] };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["The model's response was not a JSON object."] };
  }
  const v = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const field of KNOWN_FIELDS) {
    if (!(field in v)) errors.push(`Missing field: ${field}.`);
  }
  const textOrNull = (name: string) => {
    if (name in v && v[name] !== null && typeof v[name] !== "string") errors.push(`${name} must be text or null.`);
  };
  textOrNull("merchant");
  textOrNull("purpose");
  if ("amount_dollars" in v && v.amount_dollars !== null && !(typeof v.amount_dollars === "number" && Number.isFinite(v.amount_dollars))) {
    errors.push("amount_dollars must be a number or null.");
  }
  if ("category" in v && v.category !== null && !(DRAFT_CATEGORIES as readonly unknown[]).includes(v.category)) {
    errors.push("category must be a supported category or null.");
  }
  if ("missing_information" in v && !(Array.isArray(v.missing_information) && v.missing_information.every((m) => typeof m === "string"))) {
    errors.push("missing_information must be a list of text.");
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    fields: {
      merchant: v.merchant as string | null,
      amount_dollars: v.amount_dollars as number | null,
      category: v.category as string | null,
      purpose: v.purpose as string | null,
      missing_information: v.missing_information as string[],
    },
    ignoredFields: Object.keys(v).filter((k) => !KNOWN_FIELDS.has(k)),
  };
}

const normalize = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Every number written in the text, as whole cents. */
function amountsInText(text: string): Set<number> {
  const found = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return new Set(found.map((n) => Math.round(Number(n.replace(/,/g, "")) * 100)));
}

export function buildDraft(fields: ModelFields, requestText: string): { draft: ProposalDraft; notes: string[] } {
  const notes: string[] = [];

  let merchant = fields.merchant?.trim() || null;
  if (merchant && (merchant.length > MAX_TEXT_LENGTH || !normalize(requestText).includes(normalize(merchant)))) {
    notes.push("Discarded the merchant because it isn't in the student's text.");
    merchant = null;
  }

  let amountCents: number | null = null;
  if (fields.amount_dollars !== null) {
    const cents = Math.round(fields.amount_dollars * 100);
    if (cents <= 0 || cents > MAX_AMOUNT_CENTS || Math.abs(fields.amount_dollars * 100 - cents) > 1e-6) {
      notes.push("Discarded the amount because it isn't a sensible dollar value.");
    } else if (!amountsInText(requestText).has(cents)) {
      notes.push("Discarded the amount because it isn't in the student's text.");
    } else {
      amountCents = cents;
    }
  }

  // Not grounded: the text rarely names a category, so this is taken as the model gave it.
  const category = fields.category;
  const purpose = fields.purpose?.trim().slice(0, MAX_TEXT_LENGTH) || null;

  const missingInformation: ProposalDraft["missingInformation"] = [];
  if (!merchant) missingInformation.push("merchant");
  if (amountCents === null) missingInformation.push("amount");
  if (!category) missingInformation.push("category");

  return {
    draft: { merchant, amountCents, category, purpose, missingInformation, readyForProposal: missingInformation.length === 0 },
    notes,
  };
}
