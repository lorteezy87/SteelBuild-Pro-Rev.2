/**
 * Pure sub-processor disclosure catalog (public legal page).
 */

export type SubprocessorRow = {
  name: string;
  purpose: string;
  location: string;
  region: string;
};

export const SUBPROCESSORS: SubprocessorRow[] = [
  {
    name: "Supabase",
    purpose: "Database, authentication, and file storage (our backend of record).",
    location: "United States",
    region: "AWS us-east-1",
  },
  {
    name: "Vercel",
    purpose: "Web frontend hosting and content delivery (CDN).",
    location: "United States",
    region: "US",
  },
  {
    name: "Stripe",
    purpose: "Subscription billing and payment processing.",
    location: "United States",
    region: "US",
  },
  {
    name: "Sentry",
    purpose: "Error monitoring and performance (masked session replay — text masked, media blocked).",
    location: "United States",
    region: "US",
  },
  {
    name: "OpenAI",
    purpose: "AI-assisted document analysis (drawing revision comparison, sheet extraction, email classification, RFI drafting). API data is not used to train their models.",
    location: "United States",
    region: "US · no-training API terms",
  },
  {
    name: "Anthropic",
    purpose: "AI-assisted document analysis (drawing revision comparison, sheet extraction, email classification, RFI drafting). API data is not used to train their models.",
    location: "United States",
    region: "US · no-training API terms",
  },
];
