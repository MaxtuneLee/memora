import { describe, expect, test } from "vite-plus/test";

import { createFileTools } from "@/lib/chat/tools/fileTools";

describe("content chat tools", () => {
  test("exposes extracted content search and read tools", () => {
    const tools = createFileTools({ query: () => [] }, {});
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["search_files", "read_extracted_content"]),
    );
  });
});
