import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");

describe("package boundary", () => {
  it("does not depend on React or the web package", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.peerDependencies,
    };
    expect(dependencies).not.toHaveProperty("react");
    expect(dependencies).not.toHaveProperty("react-dom");
    expect(dependencies).not.toHaveProperty("@memora/web");

    const sourceFiles = (await readdir(path.join(packageRoot, "src"))).filter((file) =>
      file.endsWith(".ts"),
    );
    const sources = await Promise.all(
      sourceFiles.map((file) => readFile(path.join(packageRoot, "src", file), "utf8")),
    );
    expect(sources.join("\n")).not.toMatch(/(?:from|import\()\s*["'](?:react|@memora\/web)/u);
  });
});
