// The boundary around the model's answer. The model's output is untrusted, so this file
// decides what survives. It uses only deterministic checks:
//   1. Schema: valid JSON with exactly the expected field types, or it's rejected whole.
//   2. Unknown fields such as "decision" or "signature" are dropped and reported.
//   3. Grounding: a merchant or amount that isn't in the student's text is thrown out.
//   4. Missing information is recalculated here. The model's own list is only a hint.
// A draft only ever pre-fills a form. It isn't signed, evaluated or trusted by anything.

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

/** Step 1 and 2: the model's raw text must be valid JSON of exactly the expected shape. */
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

/** Steps 3 and 4: keep only what the student's text supports. */
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

  const category = fields.category;
  const purpose = fields.purpose?.trim().slice(0, MAX_TEXT_LENGTH) || null;
  const missingInformation: ProposalDraft["missingInformation"] = [
    ...(merchant ? [] : (["merchant"] as const)),
    ...(amountCents !== null ? [] : (["amount"] as const)),
    ...(category ? [] : (["category"] as const)),
  ];

  return {
    draft: { merchant, amountCents, category, purpose, missingInformation, readyForProposal: missingInformation.length === 0 },
    notes,
  };
}
