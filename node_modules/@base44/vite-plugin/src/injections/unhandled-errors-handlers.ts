/// <reference types="vite/client" />

window.removeEventListener("unhandledrejection", handleUnhandledRejection);
window.removeEventListener("error", handleWindowError);

window.addEventListener("unhandledrejection", handleUnhandledRejection);
window.addEventListener("error", handleWindowError);

let shouldPropagateErrors = true;
let suppressionTimer: ReturnType<typeof setTimeout> | null = null;

if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", () => {
    shouldPropagateErrors = false;

    if (suppressionTimer) {
      clearTimeout(suppressionTimer);
    }

    suppressionTimer = setTimeout(() => {
      shouldPropagateErrors = true;
      suppressionTimer = null;
    }, import.meta.env.VITE_HMR_ERROR_SUPPRESSION_DELAY ?? 10000);
  });
  import.meta.hot.on("vite:beforeFullReload", () => {
    shouldPropagateErrors = false;
    if (suppressionTimer) {
      clearTimeout(suppressionTimer);
      suppressionTimer = null;
    }
  });
}

function onAppError({
  title,
  details,
  componentName,
  originalError,
}: {
  title: string;
  details: string;
  componentName: string;
  originalError: any;
}) {
  if (originalError?.response?.status === 402 || !shouldPropagateErrors) {
    return;
  }
  window.parent?.postMessage(
    {
      type: "app_error",
      error: {
        title: title.toString(),
        details: details?.toString(),
        componentName: componentName?.toString(),
        stack: originalError?.stack?.toString(),
      },
    },
    "*"
  );
}

function handleUnhandledRejection(event: any) {
  const stack = event.reason.stack;
  // extract function name from "at X (eval" where x is the function name
  const functionName = stack.match(/at\s+(\w+)\s+\(eval/)?.[1];
  const msg = functionName
    ? `Error in ${functionName}: ${event.reason.toString()}`
    : event.reason.toString();
  onAppError({
    title: msg,
    details: event.reason.toString(),
    componentName: functionName,
    originalError: event.reason,
  });
}

function handleWindowError(event: any) {
  const stack = event.error?.stack;
  let functionName = stack.match(/at\s+(\w+)\s+\(eval/)?.[1];
  if (functionName === "eval") {
    functionName = null;
  }

  const msg = functionName
    ? `in ${functionName}: ${event.error.toString()}`
    : event.error.toString();
  onAppError({
    title: msg,
    details: event.error.toString(),
    componentName: functionName,
    originalError: event.error,
  });
}
