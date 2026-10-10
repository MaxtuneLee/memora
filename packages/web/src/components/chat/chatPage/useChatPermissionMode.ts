import { useCallback, useEffect, useState } from "react";

import { loadChatSession, updateChatSession } from "@/lib/chat/chatSessionStorage";
import type { PermissionMode } from "@/lib/chat/permissions";

/** This chat's Permission mode override, stored with the chat; null follows Settings. */
export const useChatPermissionMode = (sessionId: string) => {
  const [state, setState] = useState<{ sessionId: string; mode: PermissionMode | null }>({
    sessionId,
    mode: null,
  });
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    void loadChatSession(sessionId)
      .then((record) => {
        if (live) setState({ sessionId, mode: record?.permissionMode ?? null });
      })
      .catch(console.error);
    return () => {
      live = false;
    };
  }, [sessionId]);

  const setMode = useCallback(
    (mode: PermissionMode | null) => {
      if (!sessionId) return;
      setState({ sessionId, mode });
      void updateChatSession(sessionId, (record) => ({
        ...record,
        permissionMode: mode ?? undefined,
      })).catch(console.error);
    },
    [sessionId],
  );

  return { mode: state.sessionId === sessionId ? state.mode : null, setMode };
};
