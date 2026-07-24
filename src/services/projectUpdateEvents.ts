export const PROJECT_UPDATED_EVENT = "sbp:project-updated";

type ProjectRecord = Record<string, unknown> & { id?: string };

/** Notify ProjectContext after any successful Project.update call. */
export function emitProjectUpdated(project: ProjectRecord): void {
  if (typeof window === "undefined" || !project?.id) return;
  window.dispatchEvent(new CustomEvent(PROJECT_UPDATED_EVENT, { detail: project }));
}

/** Subscribe to successful project writes and return an unsubscribe function. */
export function subscribeProjectUpdated(handler: (project: ProjectRecord) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const project = (event as CustomEvent<ProjectRecord>).detail;
    if (project?.id) handler(project);
  };
  window.addEventListener(PROJECT_UPDATED_EVENT, listener);
  return () => window.removeEventListener(PROJECT_UPDATED_EVENT, listener);
}
