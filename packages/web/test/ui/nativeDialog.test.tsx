import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";

test("native dialog wrapper renders a real dialog element with panel and state hooks", async () => {
  const { NativeDialog } = await import("../../src/components/ui/NativeDialog");

  const html = renderToStaticMarkup(
    <NativeDialog open={true} onOpenChange={() => {}}>
      <div>Dialog body</div>
    </NativeDialog>,
  );

  expect(html).toContain("<dialog");
  expect(html).toContain('data-state="open"');
  expect(html).toContain("Dialog body");
});
