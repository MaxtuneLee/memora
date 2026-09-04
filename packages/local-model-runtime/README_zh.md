# @memora/local-model-runtime

[English](./README.md) | 中文

`@memora/local-model-runtime` 提供 Memora 本地模型的运行时抽象。它负责定义模型、校验请求、调度任务、在 SharedWorker 中执行模型，并以异步事件流返回状态、下载进度和推理结果。

包本身不绑定浏览器存储方案。宿主应用需要实现资源缓存和任务快照接口；Memora Web 当前使用 OPFS 实现这两类存储。

## 功能

- 按 `asr`、`chat`、`embedding`、`formula` 划分模型池。
- 每个模型池运行一个 SharedWorker，同一池内的任务串行执行。
- 支持 `interactive` 和 `background` 两种优先级，交互任务优先出队。
- 支持聊天生成、音频转写、Embedding、公式识别和模型预加载任务。
- 通过 `AsyncGenerator` 持续返回任务状态、模型文件下载进度、流式文本和最终结果。
- 支持 `AbortSignal` 取消请求。
- 将请求和事件保存为快照。SharedWorker 重新创建后，可以恢复未完成任务并重新发送已保存事件。
- 通过 `LocalModelAssetCache` 注入模型资源缓存，避免运行时依赖特定文件系统。
- 内置 Qwen、Gemma 和 Whisper 的 Transformers.js 处理器。

## 包导出

主入口：

```ts
import {
  createLocalModelClient,
  getLocalModelManifest,
  startSharedModelWorkerRuntime,
  type LocalModelAssetCache,
  type LocalModelTaskStore,
  type LocalModelWorkerRunner,
} from "@memora/local-model-runtime";
```

Worker 入口包含模型执行代码和 Transformers.js 缓存配置：

```ts
import { runLocalModelTask, setLocalModelAssetCache } from "@memora/local-model-runtime/worker";
```

将模型处理器放在单独的 `./worker` 入口，可以避免主线程只使用协议和客户端时加载完整的模型执行代码。

## 架构

```text
UI / feature code
  -> LocalModelClient
  -> host LocalModelWorkerRunner
  -> one SharedWorker per pool
  -> SharedModelWorkerRuntime
  -> model task handler
  -> Transformers.js / WebGPU or WASM

Storage adapters
  -> LocalModelTaskStore: request snapshots and event history
  -> LocalModelAssetCache: downloaded model files
```

`LocalModelClient` 根据 manifest 中的 `pool` 将预加载请求发送到对应模型池。找不到 manifest 时，它会直接返回 `model-not-found` 错误事件，不会选择默认 worker。

## 在宿主应用中接入

### 1. 实现模型资源缓存

模型资源缓存负责读取、写入和删除 Transformers.js 下载的文件：

```ts
import type { LocalModelAssetCache } from "@memora/local-model-runtime";

export const assetCache: LocalModelAssetCache = {
  async match(request) {
    // 返回缓存中的 Response；未命中时返回 undefined。
    return undefined;
  },
  async put(request, response) {
    // 将 response 保存到宿主提供的持久化存储。
  },
  async removeModel(manifest) {
    // 删除 manifest.modelId 对应的全部模型文件。
  },
};
```

浏览器宿主可以使用 OPFS、Cache Storage 或 IndexedDB。实现需要保留响应 body，并允许后续构造可读取的 `Response`。

### 2. 实现任务快照存储

任务快照用于保存任务输入、状态和已经发出的事件：

```ts
import type { LocalModelTaskStore } from "@memora/local-model-runtime";

export const taskStore: LocalModelTaskStore = {
  async readSnapshots(pool) {
    return [];
  },
  async createSnapshot(pool, snapshot) {
    // 首次保存任务输入和状态。
  },
  async updateSnapshot(pool, snapshot) {
    // 更新状态和事件历史。
  },
  async removeSnapshot(pool, requestId) {
    // 客户端确认终态事件已经消费后删除快照。
  },
};
```

`asr.transcribe` 的 `Float32Array` 和 `formula.recognize` 的 `Blob` 需要由具体实现保存为二进制数据，恢复时重新构造原始任务输入。

### 3. 创建 SharedWorker 入口

每个 pool 使用独立的 SharedWorker 实例。可以让多个实例复用同一个入口文件，再通过 worker 名称确定 pool：

```ts
import { startSharedModelWorkerRuntime, type LocalModelPoolKey } from "@memora/local-model-runtime";
import { runLocalModelTask, setLocalModelAssetCache } from "@memora/local-model-runtime/worker";

import { assetCache } from "./assetCache";
import { taskStore } from "./taskStore";

const poolsByWorkerName = {
  "model-asr": "asr",
  "model-chat": "chat",
  "model-embedding": "embedding",
  "model-formula": "formula",
} as const satisfies Record<string, LocalModelPoolKey>;

const workerName = (self as unknown as { name: string }).name;
const pool = poolsByWorkerName[workerName as keyof typeof poolsByWorkerName];

if (!pool) throw new Error(`Unknown local model worker: ${workerName}`);

setLocalModelAssetCache(assetCache);

startSharedModelWorkerRuntime({
  pool,
  scope: self,
  taskStore,
  runTask: (task, context) => runLocalModelTask(task, context.emit, context.isCanceled),
});
```

SharedWorker 运行时负责：

- 接收 `run`、`subscribe`、`cancel`、`acknowledge` 和 `disconnect` 消息。
- 检查任务是否属于当前 pool。
- 创建快照后将任务加入优先级队列。
- 为事件分配递增的 `sequence`，持久化并发送给所有订阅端口。
- 恢复未完成任务，并抑制恢复执行时产生的重复输出事件。
- 在客户端确认终态事件后清理任务快照。

### 4. 在主线程实现 Worker runner

宿主负责创建四个具名 SharedWorker、维护 `MessagePort` 连接，并实现 `LocalModelWorkerRunner`：

```ts
import type { LocalModelWorkerRunner } from "@memora/local-model-runtime";

const workerRunner: LocalModelWorkerRunner = {
  async *run(pool, input) {
    // 1. 为请求生成 requestId。
    // 2. 向 pool 对应的 MessagePort 发送 run 消息。
    // 3. 将收到的 sequenced event 转换为 AsyncGenerator。
    // 4. AbortSignal 触发时发送 cancel。
    // 5. 消费完 completed、failed 或 aborted 后发送 acknowledge。
  },
};
```

运行时有意不创建 SharedWorker，因此不同宿主可以决定 worker URL、生命周期、开发调试信息和连接复用方式。

## 使用客户端

### 预加载模型

```ts
import { createLocalModelClient } from "@memora/local-model-runtime";

const client = createLocalModelClient(workerRunner);

for await (const event of client.preloadModel("whisper-base-timestamped")) {
  if (event.type === "model-progress") {
    console.log(event.file, event.progress, event.total);
  }

  if (event.type === "error") {
    console.error(event.error.code, event.error.message);
  }
}
```

预加载默认使用 `background` 优先级。

### 音频转写

```ts
const controller = new AbortController();

for await (const event of client.transcribeAudio(
  {
    modelId: "whisper-base-timestamped",
    audio: pcmSamples,
    language: "zh",
    returnTimestamps: "word",
  },
  { signal: controller.signal },
)) {
  if (event.type === "transcript-delta") {
    console.log(event.text);
  }

  if (event.type === "transcript-complete") {
    console.log(event.text, event.chunks);
  }
}
```

`audio` 是单声道 PCM `Float32Array`。调用方负责在提交前完成解码和采样率处理。

### 流式聊天

```ts
for await (const event of client.streamChat({
  modelId: "qwen3.5-0.8b-onnx-opt",
  systemPrompt: "Answer clearly.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    },
  ],
  tools: [],
  reasoningMode: "non-thinking",
})) {
  switch (event.type) {
    case "text-delta":
      console.log(event.delta);
      break;
    case "usage":
      console.log(event.totalTokens);
      break;
    case "error":
      console.error(event.error);
      break;
  }
}
```

聊天请求会根据 manifest 校验输入模态、推理模式和工具调用能力。

## 直接提交底层任务

`LocalModelClient` 当前提供聊天、ASR 和预加载的高层方法。Embedding 和公式任务通过 runner 直接提交：

```ts
const events = workerRunner.run("embedding", {
  priority: "interactive",
  task: {
    kind: "embedding.generate",
    input: {
      model: "bge-small-en",
      texts: ["A local-first note"],
    },
  },
});

for await (const event of events) {
  if (event.type === "embedding-complete") {
    console.log(event.dimension, event.values);
  }
}
```

## 内置模型

| Manifest ID                | Pool   | Adapter  | 输入        |
| -------------------------- | ------ | -------- | ----------- |
| `whisper-base-timestamped` | `asr`  | Whisper  | audio       |
| `qwen3.5-0.8b-onnx-opt`    | `chat` | Qwen 3.5 | text, image |
| `gemma-4-e2b-it-onnx`      | `chat` | Gemma 4  | text, image |

可以通过 `builtInLocalModelManifests` 枚举模型，通过 `getLocalModelManifest(id)` 查询单个 manifest。新增模型时，需要同时提供 manifest 和与其 adapter 对应的任务处理器。

## 事件与任务结束

所有任务都会产生状态事件：

```text
queued -> assigned -> loading-model -> running -> completed
                                                   failed
                                                   aborted
```

具体处理器可以跳过不适用的中间状态。`completed`、`failed` 和 `aborted` 是终态。调用方应持续消费 generator，直到结束，以便主线程向 worker 发送 `acknowledge` 并清理快照。

常用事件包括：

- `model-progress`：模型文件名、已下载进度和总量。
- `text-delta`、`reasoning-delta`：聊天流式输出。
- `tool-call-*`：工具调用流。
- `transcript-delta`、`transcript-complete`：音频转写结果。
- `embedding-complete`、`formula-complete`：任务最终结果。
- `error`：结构化错误码、用户可读消息和可选详情。

## 开发命令

在 workspace 根目录执行：

```bash
vp run @memora/local-model-runtime#build
vp run @memora/local-model-runtime#dev
vp run @memora/local-model-runtime#lint
vp run @memora/local-model-runtime#test
```

`dev` 会监听源码并重新构建 `dist`。包包含 `.` 和 `./worker` 两个构建入口。
