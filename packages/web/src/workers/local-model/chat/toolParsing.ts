export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

const CHAT_TEMPLATE_TOOL_CALL_PATTERN = /<\|tool_call>call:(\w+)\{([\s\S]*?)\}<tool_call\|>/;
const CHAT_TEMPLATE_TOOL_ARG_PATTERN = /(\w+):<\|"\|>([\s\S]*?)<\|"\|>/g;
const XML_TOOL_CALL_PATTERN = /<tool_call>([\s\S]*?)<\/tool_call>/;
const XML_FUNCTION_PATTERN = /<function=([\w.-]+)>/;
const XML_PARAMETER_PATTERN = /<parameter=([\w.-]+)>/g;

export const parseJsonToolCall = (text: string): ParsedToolCall | null => {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name.trim()) return null;
    if (
      !record.arguments ||
      typeof record.arguments !== "object" ||
      Array.isArray(record.arguments)
    ) {
      return null;
    }

    return {
      name: record.name,
      arguments: record.arguments as Record<string, unknown>,
    };
  } catch {
    return null;
  }
};

export const parseChatTemplateToolCall = (text: string): ParsedToolCall | null => {
  const match = CHAT_TEMPLATE_TOOL_CALL_PATTERN.exec(text);
  if (!match) return null;

  const [, name, rawArguments] = match;
  const args = parseChatTemplateToolArguments(rawArguments);

  return { name, arguments: args };
};

export const parseXmlToolCall = (text: string): ParsedToolCall | null => {
  const toolCallMatch = XML_TOOL_CALL_PATTERN.exec(text);
  if (!toolCallMatch) return null;

  const body = toolCallMatch[1];
  const functionMatch = XML_FUNCTION_PATTERN.exec(body);
  if (!functionMatch) return null;

  const [, name] = functionMatch;
  const parameters: Array<{ name: string; valueStart: number; valueEnd: number }> = [];
  const matches = [...body.matchAll(XML_PARAMETER_PATTERN)];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    if (match.index === undefined) continue;

    const valueStart = match.index + match[0].length;
    const nextMatch = matches[index + 1];
    const valueEnd = nextMatch?.index ?? body.length;
    parameters.push({ name: match[1], valueStart, valueEnd });
  }

  const args: Record<string, unknown> = {};
  for (const parameter of parameters) {
    args[parameter.name] = parseLooseToolArgumentValue(
      body.slice(parameter.valueStart, parameter.valueEnd).trim(),
    );
  }

  return { name, arguments: args };
};

const parseChatTemplateToolArguments = (rawArguments: string): Record<string, unknown> => {
  const args: Record<string, unknown> = {};
  const pairs = splitTopLevelArguments(rawArguments);
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf(":");
    if (separatorIndex <= 0) continue;

    const key = pair.slice(0, separatorIndex).trim();
    if (!/^\w+$/.test(key)) continue;
    args[key] = parseChatTemplateToolArgumentValue(pair.slice(separatorIndex + 1).trim());
  }

  if (Object.keys(args).length > 0) return args;

  for (const argMatch of rawArguments.matchAll(CHAT_TEMPLATE_TOOL_ARG_PATTERN)) {
    args[argMatch[1]] = argMatch[2];
  }
  return args;
};

const splitTopLevelArguments = (rawArguments: string): string[] => {
  const pairs: string[] = [];
  let current = "";
  let depth = 0;
  let inTemplateString = false;

  for (let index = 0; index < rawArguments.length; index++) {
    if (rawArguments.startsWith('<|"|>', index)) {
      inTemplateString = !inTemplateString;
      current += '<|"|>';
      index += '<|"|>'.length - 1;
      continue;
    }

    const char = rawArguments[index];
    if (!inTemplateString) {
      if (char === "{" || char === "[") depth++;
      if (char === "}" || char === "]") depth = Math.max(0, depth - 1);
      if (char === "," && depth === 0) {
        pairs.push(current);
        current = "";
        continue;
      }
    }
    current += char;
  }

  if (current.trim()) {
    pairs.push(current);
  }
  return pairs;
};

const parseChatTemplateToolArgumentValue = (value: string): unknown => {
  if (value.startsWith('<|"|>') && value.endsWith('<|"|>')) {
    return value.slice('<|"|>'.length, -'<|"|>'.length);
  }

  return parseLooseToolArgumentValue(value);
};

const parseLooseToolArgumentValue = (value: string): unknown => {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);

  return value;
};
