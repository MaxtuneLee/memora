import { OpenAICompatibleProvider} from "@ai-sdk/openai-compatible"

interface Agent {
    
}

interface AgentOptions{
    systemPrompt: string;
    model: OpenAICompatibleProvider;
    messages: Message[];
    streamingOptions: {
        isStreaming: boolean;
        streamMessage: Message | null;
    }
}

interface Message {
    role: "user" | "assistant" | "system";
    content: string;
}