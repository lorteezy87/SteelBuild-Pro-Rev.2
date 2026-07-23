function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message.trim() : "";
  }
  return "";
}

export function presentPieceControlError(
  error: unknown,
  fallback: string,
): string {
  const message = errorMessage(error);
  if (!message) return fallback;
  if (/^PGRST\d+/i.test(message)) return fallback;

  if (/CANONICAL_RELEASE_NO_SCOPE/i.test(message)) {
    return "Fabrication release requires active pieces assigned to this work package.";
  }
  if (/CANONICAL_RELEASE_ALREADY_EXISTS/i.test(message)) {
    return "This work package is already released for fabrication.";
  }
  if (/CANONICAL_RELEASE_BLOCKED/i.test(message)) {
    return "Fabrication release checks are incomplete. Add an exception reason to continue.";
  }
  if (/Pilot transition blocked/i.test(message)) {
    return "Pilot workflow is blocked. Review the readiness checks and try again.";
  }
  if (/Live transition blocked/i.test(message)) {
    return "Live workflow is blocked. Review the readiness checks and try again.";
  }
  if (/Unsafe Piece Control transition|Invalid Piece Control mode/i.test(message)) {
    return "This Piece Register workflow change is not allowed.";
  }
  if (/canonical logistics transition/i.test(message)) {
    return "The selected pieces are not ready for this logistics step.";
  }
  if (/active canonical release before production can advance/i.test(message)) {
    return "Release this work package for fabrication before recording production.";
  }
  if (/Piece control is disabled/i.test(message)) {
    return "Set up the Piece Register before using this action.";
  }
  if (/Piece import batch not found/i.test(message)) {
    return "This import batch is no longer available. Refresh and try again.";
  }
  if (/Piece import batch must be approved before apply/i.test(message)) {
    return "Approve this import batch before applying it.";
  }
  if (/Not authorized|permission denied|42501/i.test(message)) {
    return "You do not have permission to complete this Piece Register action.";
  }

  return fallback;
}
