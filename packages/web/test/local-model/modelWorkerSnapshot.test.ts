import type { LocalModelTask } from "@memora/local-model-runtime";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const memory = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock("@memora/fs", () => {
  const toBytes = async (value: string | ArrayBuffer | ArrayBufferView | Blob) => {
    if (typeof value === "string") return new TextEncoder().encode(value);
    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  };

  return {
    write: async (path: string, value: string | ArrayBuffer | ArrayBufferView | Blob) => {
      memory.set(path, await toBytes(value));
    },
    file: (path: string) => ({
      text: async () => new TextDecoder().decode(memory.get(path)),
      arrayBuffer: async () => memory.get(path)?.slice().buffer ?? new ArrayBuffer(0),
    }),
    dir: (path: string) => ({
      exists: async () => Array.from(memory.keys()).some((key) => key.startsWith(`${path}/`)),
      children: async () => {
        const names = new Set(
          Array.from(memory.keys())
            .filter((key) => key.startsWith(`${path}/`))
            .map((key) => key.slice(path.length + 1).split("/")[0])
            .filter(Boolean),
        );
        return Array.from(names, (name) => ({ kind: "dir", name, path: `${path}/${name}` }));
      },
      remove: async () => {
        for (const key of Array.from(memory.keys())) {
          if (key === path || key.startsWith(`${path}/`)) memory.delete(key);
        }
      },
    }),
  };
});

import {
  readModelWorkerSnapshots,
  removeModelWorkerSnapshot,
  writeModelWorkerSnapshotTask,
} from "../../src/workers/model-worker/snapshotStore";

describe("model worker OPFS snapshots", () => {
  beforeEach(() => memory.clear());

  test("round-trips ASR audio without expanding it into snapshot JSON", async () => {
    const task: LocalModelTask = {
      kind: "asr.transcribe",
      input: {
        modelId: "whisper-base",
        audio: new Float32Array([0.25, -0.5, 0.75]),
        language: "en",
      },
    };
    await writeModelWorkerSnapshotTask("asr", {
      requestId: "audio-request",
      priority: "interactive",
      task,
      status: "running",
      events: [{ sequence: 1, event: { type: "status", status: "running" } }],
      createdAt: 1,
      updatedAt: 2,
    });

    const [snapshot] = await readModelWorkerSnapshots("asr");
    expect(snapshot?.task.kind).toBe("asr.transcribe");
    if (snapshot?.task.kind !== "asr.transcribe") throw new Error("Missing ASR snapshot.");
    expect(Array.from(snapshot.task.input.audio)).toEqual([0.25, -0.5, 0.75]);
    expect(
      new TextDecoder().decode(memory.get("/model-worker-snapshots/asr/audio-request/task.json")),
    ).not.toContain("0.25");
  });

  test("round-trips formula blobs and removes acknowledged snapshots", async () => {
    await writeModelWorkerSnapshotTask("formula", {
      requestId: "formula-request",
      priority: "interactive",
      task: {
        kind: "formula.recognize",
        input: { blob: new Blob(["formula-image"], { type: "image/png" }) },
      },
      status: "queued",
      events: [],
      createdAt: 1,
      updatedAt: 1,
    });

    const [snapshot] = await readModelWorkerSnapshots("formula");
    if (snapshot?.task.kind !== "formula.recognize") {
      throw new Error("Missing formula snapshot.");
    }
    expect(snapshot.task.input.blob.type).toBe("image/png");
    expect(await snapshot.task.input.blob.text()).toBe("formula-image");

    await removeModelWorkerSnapshot("formula", "formula-request");
    expect(await readModelWorkerSnapshots("formula")).toEqual([]);
  });
});
