import { useStore, useClientDocument } from "@livestore/react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import OnboardingExperience, {
  type OnboardingProfileInput,
} from "@/components/onboarding/OnboardingExperience";
import { generatePersonalityMarkdownWithAI } from "@/lib/chat/personalityGenerator";
import { settingsProvidersQuery$ } from "@/lib/settings/queries";
import {
  loadGlobalMemoryData,
  saveGlobalMemoryData,
} from "@/lib/settings/personalityStorage";
import { providerEvents, type provider as ProviderRow } from "@/livestore/provider";
import { settingsTable } from "@/livestore/setting";

export const Component = () => {
  const { store } = useStore();
  const navigate = useNavigate();
  const providers = store.useQuery(settingsProvidersQuery$) as ProviderRow[];
  const [, setSettings] = useClientDocument(settingsTable);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingSoulDocument, setStreamingSoulDocument] = useState("");

  const findProviderByEndpoint = useCallback(
    (endpoint: string): ProviderRow | null => {
      const normalizedEndpoint = endpoint.trim().replace(/\/+$/, "");
      if (!normalizedEndpoint) {
        return null;
      }
      return (
        providers.find((provider) => {
          const chatCompletionsEndpoint = `${provider.baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
          const responsesEndpoint = `${provider.baseUrl.trim().replace(/\/+$/, "")}/responses`;
          return (
            chatCompletionsEndpoint === normalizedEndpoint ||
            responsesEndpoint === normalizedEndpoint
          );
        }) ?? null
      );
    },
    [providers],
  );

  const markOnboardingCompleted = useCallback(
    (input: OnboardingProfileInput, providerId: string) => {
      setSettings({
        selectedProviderId: providerId,
        selectedModel: input.model.trim(),
        onboardingName: input.name.trim(),
        onboardingCompleted: true,
        onboardingSkippedAt: "",
      });
    },
    [setSettings],
  );

  const upsertProvider = useCallback(
    (input: OnboardingProfileInput): string => {
      const existing = findProviderByEndpoint(input.endpoint);
      const endpoint = input.endpoint.trim().replace(/\/+$/, "");
      const baseUrl =
        input.apiFormat === "responses"
          ? endpoint.replace(/\/responses$/i, "")
          : endpoint.replace(/\/chat\/completions$/i, "");
      const providerName = "Onboarding Provider";

      if (existing) {
        store.commit(
          providerEvents.providerUpdated({
            id: existing.id,
            name: existing.name || providerName,
            baseUrl,
            apiKey: input.apiKey,
            apiFormat: input.apiFormat,
            updatedAt: new Date(),
          }),
        );
        return existing.id;
      }

      const id = crypto.randomUUID();
      store.commit(
        providerEvents.providerCreated({
          id,
          name: providerName,
          baseUrl,
          apiKey: input.apiKey,
          apiFormat: input.apiFormat,
          createdAt: new Date(),
        }),
      );
      return id;
    },
    [findProviderByEndpoint, store],
  );

  const handleComplete = useCallback(
    async (input: OnboardingProfileInput) => {
      if (isSaving) {
        return;
      }

      setIsSaving(true);
      setErrorMessage(null);
      setStreamingSoulDocument("");

      try {
        const personality = await generatePersonalityMarkdownWithAI({
          endpoint: input.endpoint,
          apiKey: input.apiKey,
          model: input.model,
          apiFormat: input.apiFormat,
          userName: input.name,
          primaryUseCase: input.primaryUseCase,
          assistantStyle: input.assistantStyle,
          onTextDelta: (text) => {
            setStreamingSoulDocument(text);
          },
        });

        const existing = (await loadGlobalMemoryData()) ?? { notices: [] };

        await saveGlobalMemoryData({
          personality,
          notices: existing.notices,
        });

        const providerId = upsertProvider(input);
        markOnboardingCompleted(input, providerId);
        setStreamingSoulDocument("");
        navigate("/chat", { replace: true });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not generate Soul Document. Please try again.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, markOnboardingCompleted, navigate, upsertProvider],
  );

  const experienceKey = useMemo(() => "onboarding-experience-v2", []);

  return (
    <OnboardingExperience
      key={experienceKey}
      isSaving={isSaving}
      errorMessage={errorMessage}
      streamingSoulDocument={streamingSoulDocument}
      onComplete={handleComplete}
    />
  );
};
