import { Toast } from "@base-ui/react/toast";
import { useCallback, useEffect, useRef } from "react";

import { getLocalModelCacheStatus, getLocalModelOptions } from "@/lib/local-model";
import type { AiFeatureId, FeatureModelRoute } from "@/lib/models/modelRouting";

export const useLocalModelSelectionNotice = () => {
  const { add } = Toast.useToastManager();
  const pending = useRef(new Map<AiFeatureId, symbol>());
  useEffect(() => {
    const requests = pending.current;
    return () => requests.clear();
  }, []);

  return useCallback(
    (feature: AiFeatureId, route: FeatureModelRoute) => {
      const request = Symbol();
      pending.current.set(feature, request);
      if (route.source !== "local") return;
      const modelName =
        getLocalModelOptions().find((model) => model.id === route.modelId)?.name ?? route.modelId;
      void getLocalModelCacheStatus(route.modelId)
        .then((status) => {
          if (pending.current.get(feature) !== request) return;
          pending.current.delete(feature);
          if (status.cached) return;
          add({
            title: `${modelName} needs to be downloaded`,
            description:
              "Download this model before using the feature. Downloads are available in Settings → Local models, or on the setup screen.",
            type: "info",
          });
        })
        .catch(() => {
          if (pending.current.get(feature) !== request) return;
          pending.current.delete(feature);
          add({
            title: "Could not check the model download",
            description: "Check this model in Settings → Local models before using the feature.",
            type: "error",
          });
        });
    },
    [add],
  );
};
