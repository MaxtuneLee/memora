import { useEffect } from "react";
import { Toast } from "@base-ui/react/toast";
import { useNavigate } from "react-router";

import { onSessionFinished } from "@/lib/agent-runtime/client";

export default function ChatFinishedToasts(): null {
  const { add } = Toast.useToastManager();
  const navigate = useNavigate();

  useEffect(
    () =>
      onSessionFinished((sessionId, title) => {
        add({
          title: "Reply ready",
          description: title,
          type: "success",
          actionProps: {
            children: "Open",
            onClick: () => void navigate(`/chat?session=${encodeURIComponent(sessionId)}`),
          },
        });
      }),
    [add, navigate],
  );

  return null;
}
