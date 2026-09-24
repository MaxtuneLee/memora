// Formats console arguments into one log line with credentials, contact details, and user
// content stripped. Best effort: anything logged as a bare string is only pattern-redacted.

const MAX_ENTRY_CHARS = 4000;
const MAX_OBJECT_STRING_CHARS = 200;
const REDACTED = "[redacted]";

// Object keys whose values are credentials or user content, never logged.
const SENSITIVE_KEY =
  /key|token|secret|password|passphrase|authorization|cookie|credential|session|content|text|prompt|message|transcript|body|query|input|output|email|name|title|path|url/i;

const TEXT_REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/data:[^\s"'`)]+/gi, "[data-url]"],
  [/\bBearer\s+[\w.~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/\b(?:sk|pk|rk|ak)-[\w-]{8,}/gi, REDACTED],
  [/([?&#][^=&#\s]*(?:key|token|secret|password|auth|signature|code|sig)[^=&#\s]*=)[^&#\s"']+/gi, `$1${REDACTED}`],
  [/("[^"]*(?:key|token|secret|password|authorization|cookie)[^"]*"\s*:\s*)"[^"]*"/gi, `$1"${REDACTED}"`],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  // Long unbroken runs are almost always keys, hashes, or encoded payloads.
  [/[A-Za-z0-9+_=-]{40,}/g, REDACTED],
];

export const redactLogText = (text: string): string =>
  TEXT_REDACTIONS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);

const serializeObject = (value: object): string => {
  try {
    return JSON.stringify(value, (key, nested: unknown) => {
      if (key && SENSITIVE_KEY.test(key)) return REDACTED;
      if (typeof nested === "string" && nested.length > MAX_OBJECT_STRING_CHARS) {
        return `${nested.slice(0, MAX_OBJECT_STRING_CHARS)}…`;
      }
      return nested;
    });
  } catch {
    return "[unserializable]";
  }
};

const formatArg = (arg: unknown): string => {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
  if (typeof arg === "string") return arg;
  if (arg === null || typeof arg !== "object") return String(arg);
  return serializeObject(arg);
};

export const formatLogEntry = (level: string, args: readonly unknown[], now = new Date()): string => {
  const text = redactLogText(args.map(formatArg).join(" "));
  const body = text.length > MAX_ENTRY_CHARS ? `${text.slice(0, MAX_ENTRY_CHARS)}…` : text;
  return `${now.toISOString()} [${level}] ${body}\n`;
};
