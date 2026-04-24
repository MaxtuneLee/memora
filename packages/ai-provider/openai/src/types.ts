export interface LLMTextContent {
  type: "text";
  text: string;
}

export interface LLMImageContent {
  type: "image_url";
  image_url: { url: string };
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | Array<LLMTextContent | LLMImageContent>;
  reasoning_content?: string;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMRequestPayload {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  stream: true;
  reasoning?: {
    effort: string;
  };
  stream_options?: {
    include_usage?: boolean;
  };
  temperature?: number;
  max_tokens?: number;
}

export type ApiFormat = "chat-completions" | "responses";

export interface ResponsesInputText {
  type: "input_text";
  text: string;
}

export interface ResponsesInputImage {
  type: "input_image";
  image_url: string;
}

export interface ResponsesInputMessage {
  role: "user" | "assistant" | "system" | "developer";
  content: string | Array<ResponsesInputText | ResponsesInputImage>;
  type?: "message";
}

export interface ResponsesFunctionCall {
  type: "function_call";
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
}

export interface ResponsesFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export type ResponsesInputItem =
  | ResponsesInputMessage
  | ResponsesFunctionCall
  | ResponsesFunctionCallOutput;

export interface ResponsesFunctionToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface ResponsesBuiltinToolDefinition {
  type: "web_search_preview" | "file_search" | "code_interpreter" | string;
  [key: string]: unknown;
}

export type ResponsesToolDefinition =
  | ResponsesFunctionToolDefinition
  | ResponsesBuiltinToolDefinition;

export interface ResponsesRequestPayload {
  model: string;
  input: ResponsesInputItem[];
  tools?: ResponsesToolDefinition[];
  stream: true;
  instructions?: string;
  reasoning?: {
    effort: string;
  };
  temperature?: number;
  max_output_tokens?: number;
}
