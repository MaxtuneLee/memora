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
