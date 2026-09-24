import { expect, test } from "vite-plus/test";

import { formatLogEntry, redactLogText } from "@/lib/appLog/appLogFormat";

const NOW = new Date("2026-09-24T10:00:00.000Z");

test("strips credentials and contact details from plain text", () => {
  const text = redactLogText(
    [
      "Authorization: Bearer abc.def-123",
      "key sk-proj-AbCdEf1234567890",
      "https://api.example.test/v1?api_key=secret123&model=gpt",
      'payload {"apiKey":"hunter2","model":"x"}',
      "mail ada@example.com",
      "jwt eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl",
      "image data:image/png;base64,iVBORw0KGgo",
    ].join("\n"),
  );

  for (const secret of [
    "abc.def-123",
    "sk-proj",
    "secret123",
    "hunter2",
    "ada@example.com",
    "eyJhbGciOi",
    "iVBORw0KGgo",
  ]) {
    expect(text).not.toContain(secret);
  }
  expect(text).toContain("model=gpt");
  expect(text).toContain('"model":"x"');
});

test("drops user content and credentials from logged objects but keeps structure", () => {
  const entry = formatLogEntry(
    "error",
    [
      "Turn failed",
      { providerId: "p1", apiKey: "k", messages: [{ content: "private note" }], status: 500 },
    ],
    NOW,
  );

  expect(entry).toBe(
    '2026-09-24T10:00:00.000Z [error] Turn failed {"providerId":"p1","apiKey":"[redacted]","messages":"[redacted]","status":500}\n',
  );
});

test("keeps error name, message, and stack", () => {
  const error = new TypeError("boom");
  error.stack = "TypeError: boom\n    at run (app.js:1:2)";
  expect(formatLogEntry("error", [error], NOW)).toContain(
    "TypeError: boom\n    at run (app.js:1:2)",
  );
});
