import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";

export const IS_DEV = import.meta.env.DEV;

export const getWidgetLabel = (widget: ChatWidgetData): string => {
  return widget.title || "interactive_widget";
};

export const formatStreamFootprint = (length: number): string => {
  if (length < 1024) {
    return `${length} chars`;
  }

  const sizeInKilobytes = length / 1024;
  return `${sizeInKilobytes.toFixed(sizeInKilobytes >= 10 ? 0 : 1)} KB`;
};

export const getPlaceholderCopy = ({
  widgetCode,
  hasStyle,
  styleReady,
  htmlText,
  hasScript,
  scriptReady,
  loadingMessage,
}: {
  widgetCode: string;
  hasStyle: boolean;
  styleReady: boolean;
  htmlText: string;
  hasScript: boolean;
  scriptReady: boolean;
  loadingMessage: string;
}): { title: string; detail: string } => {
  if (!widgetCode.trim()) {
    return {
      title: "Waiting for widget payload",
      detail: loadingMessage,
    };
  }
  if (hasStyle && !styleReady) {
    return {
      title: "Streaming styles",
      detail: loadingMessage,
    };
  }
  if (hasScript && scriptReady) {
    return {
      title: "Initializing widget",
      detail: loadingMessage,
    };
  }
  if (hasScript && !scriptReady) {
    return {
      title: "Streaming interactions",
      detail: loadingMessage,
    };
  }
  if (htmlText.trim()) {
    return {
      title: "Streaming layout",
      detail: loadingMessage,
    };
  }
  return {
    title: "Preparing widget",
    detail: loadingMessage,
  };
};

export const formatDebugTimestamp = (value: number): string => {
  const date = new Date(value);
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
    date.getMilliseconds(),
  ).padStart(3, "0")}`;
};
