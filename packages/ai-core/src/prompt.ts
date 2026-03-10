import type { MaybePromise, PromptSegment } from "./types";

export class PromptComposer {
  private segments = new Map<string, PromptSegment>();

  add(segment: PromptSegment): void {
    this.segments.set(segment.id, segment);
  }

  remove(id: string): void {
    this.segments.delete(id);
  }

  has(id: string): boolean {
    return this.segments.has(id);
  }

  update(id: string, content: string | (() => MaybePromise<string>)): void {
    const segment = this.segments.get(id);
    if (!segment) {
      throw new Error(`Prompt segment "${id}" not found`);
    }
    segment.content = content;
  }

  async compose(): Promise<string> {
    const sorted = Array.from(this.segments.values()).sort(
      (a, b) => b.priority - a.priority,
    );

    const parts: string[] = [];
    for (const segment of sorted) {
      const content =
        typeof segment.content === "function"
          ? await segment.content()
          : segment.content;
      if (content.trim()) {
        parts.push(content.trim());
      }
    }

    return parts.join("\n\n");
  }
}

export const createPromptComposer = (): PromptComposer => {
  return new PromptComposer();
};
