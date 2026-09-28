import { beforeEach, expect, test, vi } from "vite-plus/test";

const testState = vi.hoisted(() => {
  const filesByPath = new Map<string, string>();

  const dir = vi.fn((_path: string) => ({
    create: vi.fn(async () => {}),
  }));
  const file = vi.fn((path: string) => ({
    exists: vi.fn(async () => filesByPath.has(path)),
    text: vi.fn(async () => {
      const text = filesByPath.get(path);
      if (text === undefined) throw new Error(`Missing file content for ${path}`);
      return text;
    }),
    remove: vi.fn(async () => {
      filesByPath.delete(path);
    }),
  }));
  const write = vi.fn(async (path: string, data: string) => {
    filesByPath.set(path, data);
  });

  return { dir, file, filesByPath, write };
});

vi.mock("@memora/fs", () => ({
  dir: testState.dir,
  file: testState.file,
  write: testState.write,
}));

const {
  applyGlobalMemoryNoticeChanges,
  applyMemoryNoticeChanges,
  buildPersonalityMarkdown,
  loadGlobalMemoryData,
  saveGlobalMemoryData,
  savePersonalityProfile,
} = await import("@/lib/settings/personalityStorage");

beforeEach(() => {
  testState.filesByPath.clear();
  vi.clearAllMocks();
});

test("builds a fixed template with the four blanks filled in", () => {
  const markdown = buildPersonalityMarkdown({
    name: "Ada",
    primaryUseCase: "research notes",
    assistantStyle: "concise, direct",
    customInstructions: "Always cite the source file.",
  });

  expect(markdown).toContain("## User Identity\nAda");
  expect(markdown).toContain("## Primary Use Case\nresearch notes");
  expect(markdown).toContain("## Preferred Assistant Style\nconcise, direct");
  expect(markdown).toContain("## Custom Instructions\nAlways cite the source file.");
});

test("falls back to placeholders for blank fields", () => {
  const markdown = buildPersonalityMarkdown({
    name: "",
    primaryUseCase: "",
    assistantStyle: "",
    customInstructions: "",
  });

  expect(markdown).toContain("## User Identity\nNot specified");
  expect(markdown).toContain("## Primary Use Case\nNot specified");
  expect(markdown).toContain("## Preferred Assistant Style\nNot specified");
  expect(markdown).toContain("## Custom Instructions\nNone");
});

test("saving a profile is instant and preserves existing notices", async () => {
  await saveGlobalMemoryData({
    notices: [{ id: "n1", text: "Prefers metric units", createdAt: 0, updatedAt: 0 }],
  });

  await savePersonalityProfile({
    name: "Ada",
    primaryUseCase: "research notes",
    assistantStyle: "concise",
    customInstructions: "Always cite the source file.",
  });

  const memory = await loadGlobalMemoryData();
  expect(memory?.personality).toContain("## User Identity\nAda");
  expect(memory?.personality).toContain("## Custom Instructions\nAlways cite the source file.");
  expect(memory?.notices).toEqual([
    { id: "n1", text: "Prefers metric units", createdAt: 0, updatedAt: 0 },
  ]);
});

const notice = (id: string, text: string, time = 0) => ({
  id,
  text,
  createdAt: time,
  updatedAt: time,
});

test("a changed preference replaces the old notice in place", () => {
  const result = applyMemoryNoticeChanges(
    [notice("n1", "User prefers replies in English."), notice("n2", "User prefers bullet points.")],
    { add: [], replace: [{ id: "n1", text: "User prefers replies in Chinese." }], remove: [] },
    100,
  );

  expect(result.updated).toBe(true);
  expect(result.notices).toEqual([
    { id: "n1", text: "User prefers replies in Chinese.", createdAt: 0, updatedAt: 100 },
    notice("n2", "User prefers bullet points."),
  ]);
});

test("removes withdrawn notices, and a replace wins over a remove of the same notice", () => {
  const result = applyMemoryNoticeChanges(
    [notice("n1", "User prefers short answers."), notice("n2", "User prefers emoji.")],
    {
      add: [],
      replace: [{ id: "n1", text: "User prefers detailed answers." }],
      remove: ["n1", "n2"],
    },
    100,
  );

  expect(result.notices.map(({ id, text }) => ({ id, text }))).toEqual([
    { id: "n1", text: "User prefers detailed answers." },
  ]);
});

test("a replace with an unknown ID is added, and matching text refreshes instead of duplicating", () => {
  const result = applyMemoryNoticeChanges(
    [notice("n1", "User prefers tables."), notice("n2", "User prefers prose.")],
    {
      add: ["user prefers tables"],
      replace: [
        { id: "missing", text: "User prefers metric units." },
        { id: "n2", text: "User prefers tables." },
      ],
      remove: [],
    },
    100,
  );

  expect(result.notices.map(({ id, text, updatedAt }) => ({ id, text, updatedAt }))).toEqual([
    { id: "n1", text: "User prefers tables.", updatedAt: 100 },
    expect.objectContaining({ text: "User prefers metric units.", updatedAt: 100 }),
  ]);
});

test("reports no update when nothing changes", () => {
  const notices = [notice("n1", "User prefers tables.", 100)];
  expect(
    applyMemoryNoticeChanges(
      notices,
      { add: ["User prefers tables."], replace: [], remove: [] },
      100,
    ),
  ).toEqual({ updated: false, notices });
});

test("applies changes to the global memory file", async () => {
  await saveGlobalMemoryData({ notices: [notice("n1", "User prefers replies in English.")] });

  const { updated } = await applyGlobalMemoryNoticeChanges({
    add: [],
    replace: [],
    remove: ["n1"],
  });

  expect(updated).toBe(true);
  expect(await loadGlobalMemoryData()).toBeNull();
});
