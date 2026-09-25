// Real app components follow new content with scrollIntoView (the live transcript does this on
// every word). On the marketing page that would scroll the whole window and fight the reader,
// so inside a [data-demo-frame] we only scroll the component's own scroll container.
export function containDemoScrolling(): void {
  // Always invoked with .call(this) below, so the unbound reference is safe.
  // oxlint-disable-next-line typescript/unbound-method
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (
    this: Element,
    arg?: boolean | ScrollIntoViewOptions,
  ) {
    const frame = this.closest("[data-demo-frame]");
    if (!frame) {
      original.call(this, arg);
      return;
    }
    for (let el = this.parentElement; el && frame.contains(el); el = el.parentElement) {
      const { overflowY } = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(overflowY)) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        return;
      }
    }
  };
}
