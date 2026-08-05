/** Pure helpers for Landing auth/demo forms. */

export function canSubmitCredentials(email: string, password: string): boolean {
  return Boolean((email || "").trim() && password);
}

export function canSubmitEmailOnly(email: string): boolean {
  return Boolean((email || "").trim());
}

export function buildDemoPayload(demoForm: {
  name?: string;
  email?: string;
  company?: string;
  tonnage?: string;
  message?: string;
}): {
  name: string;
  email: string;
  company: string | null;
  tonnage: string | null;
  message: string | null;
} {
  return {
    name: (demoForm.name || "").trim(),
    email: (demoForm.email || "").trim(),
    company: (demoForm.company || "").trim() || null,
    tonnage: (demoForm.tonnage || "").trim() || null,
    message: (demoForm.message || "").trim() || null,
  };
}

export function isScrolledPast(scrollY: number, threshold = 30): boolean {
  return scrollY > threshold;
}
