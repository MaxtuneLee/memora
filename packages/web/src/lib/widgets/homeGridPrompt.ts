// A Home Grid widget's sendPrompt() can only reach the sandboxed iframe's postMessage channel
// (see generatedWidgetRuntime.ts); getting that text into a chat turn means leaving the
// Dashboard route entirely. sessionStorage survives the navigate to /chat without needing a
// query param or global store wired through the router.
const PENDING_HOME_GRID_PROMPT_KEY = "memora:pending-home-grid-prompt";

export const setPendingHomeGridPrompt = (text: string): void => {
  window.sessionStorage.setItem(PENDING_HOME_GRID_PROMPT_KEY, text);
};

// Removes the pending prompt as it reads it, so it fires exactly once even if the Chat page
// re-mounts (e.g. a session switch right after landing).
export const consumePendingHomeGridPrompt = (): string | null => {
  const text = window.sessionStorage.getItem(PENDING_HOME_GRID_PROMPT_KEY);
  if (text === null) {
    return null;
  }
  window.sessionStorage.removeItem(PENDING_HOME_GRID_PROMPT_KEY);
  return text;
};
