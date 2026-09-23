type AndroidBackState = {
  hasOpenOverlay: boolean;
  canGoBack: boolean;
};

export type AndroidBackAction = "dismiss-overlay" | "history-back" | "exit-app";

export function androidBackAction(state: AndroidBackState): AndroidBackAction {
  if (state.hasOpenOverlay) return "dismiss-overlay";
  if (state.canGoBack) return "history-back";
  return "exit-app";
}
