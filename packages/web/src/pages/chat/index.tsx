import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Component as ChatComponent } from "@/components/chat/ChatPage";
import { getOnboardingGateStatus } from "@/lib/onboarding/onboardingGate";

export const Component = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const enforceOnboardingGate = async () => {
      const status = await getOnboardingGateStatus();

      if (!cancelled && !status.ready) {
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
