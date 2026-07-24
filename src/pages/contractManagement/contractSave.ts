export interface ContractFormValue {
  original_contract_value?: string | number | null;
  contract_type?: string | null;
}

export interface ContractPatch {
  original_contract_value: number;
  contract_type: string | null;
}

/** Build a safe Project.update patch without silently converting bad input to 0. */
export function buildContractPatch(form: ContractFormValue): ContractPatch {
  const raw = form.original_contract_value;
  if (raw == null || String(raw).trim() === "") {
    throw new Error("Original contract value is required.");
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    throw new Error("Original contract value must be a valid number.");
  }
  if (amount < 0) {
    throw new Error("Original contract value cannot be negative.");
  }

  const contractType = String(form.contract_type ?? "").trim();
  return {
    original_contract_value: amount,
    contract_type: contractType || null,
  };
}
