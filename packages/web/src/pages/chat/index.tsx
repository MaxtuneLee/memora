import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Component as ChatComponent } from "@/components/chat/ChatPage";
import { getOnboardingGateStatus } from "@/lib/onboarding/onboardingGate";
import { useAppStore } from "@/livestore/store";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";

export const Component = () => {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$);
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const enforceOnboardingGate = async () => {
      const status = await getOnboardingGateStatus(settings.onboardingCompleted);

      if (!cancelled && !status.ready) {
        void navigate("/onboarding", { replace: true });
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
  }, [navigate, settings.onboardingCompleted]);

  if (!ready) {
    return null;
  }

  return <ChatComponent />;
};
