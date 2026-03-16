import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Component as ChatComponent } from "@/components/chat/ChatPage";
import { loadGlobalMemoryData } from "@/lib/settings/personalityStorage";

export const Component = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const enforceOnboardingGate = async () => {
      const memory = await loadGlobalMemoryData();
      const personality = memory?.personality?.trim() ?? "";

      if (!cancelled && !personality) {
        navigate("/onboarding", { replace: true });
        return;
      }

      if (!cancelled) {
        setReady(true);
      }
    };

    void enforceOnboardingGate();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!ready) {
    return null;
  }

  return <ChatComponent />;
};
