import { useCallback, useEffect, useRef, useState } from "react";
import type { WriteApprovalDecision, WriteApprovalRequest } from "@/lib/chat/tools";

export const useChatWriteApproval = (activeSessionId: string) => {
  const [pendingWriteApproval, setPendingWriteApproval] = useState<WriteApprovalRequest | null>(
    null,
  );
  const writeApprovalResolverRef = useRef<((decision: WriteApprovalDecision) => void) | null>(null);
  const sessionWriteApprovalRef = useRef<string | null>(null);

  const resolveWriteApproval = useCallback(
    (decision: WriteApprovalDecision) => {
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      if (decision === "allow_session" && activeSessionId) {
        sessionWriteApprovalRef.current = activeSessionId;
      }
      setPendingWriteApproval(null);
      resolver?.(decision);
    },
    [activeSessionId],
  );

  const requestWriteApproval = useCallback(
    (request: WriteApprovalRequest): Promise<WriteApprovalDecision> => {
      if (!activeSessionId) {
        return Promise.resolve("deny");
      }
      if (sessionWriteApprovalRef.current === activeSessionId) {
        return Promise.resolve("allow_session");
      }
      if (writeApprovalResolverRef.current) {
        return Promise.resolve("deny");
      }

      return new Promise<WriteApprovalDecision>((resolve) => {
        writeApprovalResolverRef.current = resolve;
        setPendingWriteApproval(request);
      });
    },
    [activeSessionId],
  );

  useEffect(() => {
    sessionWriteApprovalRef.current = null;
    if (writeApprovalResolverRef.current) {
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      resolver("deny");
    }
    queueMicrotask(() => {
      setPendingWriteApproval(null);
    });
  }, [activeSessionId]);

  useEffect(() => {
    return () => {
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      resolver?.("deny");
    };
  }, []);

  return {
    pendingWriteApproval,
    requestWriteApproval,
    resolveWriteApproval,
    handleAllowWriteOnce: () => resolveWriteApproval("allow_once"),
    handleAllowWriteForSession: () => resolveWriteApproval("allow_session"),
    handleDenyWrite: () => resolveWriteApproval("deny"),
  };
};
