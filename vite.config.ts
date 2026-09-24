import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {
    ignorePatterns: ["packages/web/src/generated-routes.ts"],
    printWidth: 100,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    sortPackageJson: false,
  },
});
