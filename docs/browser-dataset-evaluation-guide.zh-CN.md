# 浏览器端数据集与评测：端到端指南

本指南面向直接使用 `@memora/datasets` 和 `@memora/evaluation` 两个包的开发者，覆盖从选择 Hub 数据集到保存评测结果的完整链路。示例均使用两个包已发布并经测试验证的公开 API，不依赖内部实现细节。Web Playground（`packages/web`，仅开发环境可见）在这些 API 之上提供图形界面，其源码可作为另一份参考实现。

## 1. 查看大小并选择要下载的内容

```ts
import { inspectDataset } from "@memora/datasets";

const inspection = await inspectDataset("google/fleurs", { revision: "main" });

for (const configuration of inspection.configurations) {
  console.log(configuration.name, configuration.size); // 字节数，来自 Hub 文件列表，免费获得
  for (const split of configuration.splits) {
    console.log(" ", split.name, split.size, split.examples); // examples 此时为 undefined
  }
}
```

`inspectDataset` 只列出 Hub 上的文件路径与大小，从不读取文件内容——即使数据集有上百个 configuration（如 FLEURS 的 ~100 种语言），这一步也保持廉价。因此刚返回的 `split.examples` 是 `undefined`；这是设计如此，不是缺陷。

## 2. 解析真实条目数（可选，仅针对已选择的 split）

条目数需要读取每个文件的 Parquet footer，这项开销只应发生在用户实际要用的那个 split 上：

```ts
import { resolveDatasetSplit } from "@memora/datasets";

const resolved = await resolveDatasetSplit(inspection, "hi_in", "test");
const test = resolved.configurations
  .find((c) => c.name === "hi_in")
  ?.splits.find((s) => s.name === "test");
console.log(test?.examples); // 现在是真实数字
```

如果直接调用 `installDataset` 而不先解析，也不会丢失条目数——`installDataset` 会在下载完成后从本地分片中免费推导出 `examples` 和 `features`，写入安装清单。`resolveDatasetSplit` 的价值在于：安装前就想在界面上展示条目数时使用。

## 3. 下载选中的 split

```ts
import { installDataset } from "@memora/datasets";

const controller = new AbortController();
const [installed] = await installDataset(inspection, {
  configuration: "hi_in",
  splits: ["test"],
  signal: controller.signal,
  onProgress: ({ completedBytes, totalBytes }) => {
    console.log(`${completedBytes} / ${totalBytes}`);
  },
});

console.log(installed.examples, installed.size);
```

调用 `controller.abort()` 可取消下载；已完整下载并通过校验的文件会被保留和复用，未完成的部分文件不会被当作已安装数据暴露出来，重试会从头下载失败的文件。

## 4. 离线打开并迭代 / 分批消费

```ts
import { openDataset } from "@memora/datasets";

const dataset = await openDataset({
  datasetId: "google/fleurs",
  revision: inspection.revision,
  configuration: "hi_in",
  split: "test",
});

for await (const example of dataset) {
  console.log(example.transcription, example.lang_id);
  break;
}

for await (const batch of dataset.batches(16)) {
  await consume(batch); // 默认保留不满一批的最后一批；传 { dropLast: true } 可丢弃
}

dataset.close();
```

`openDataset` 不需要联网，只读取本地已安装的分片。音频等媒体字段以惰性引用（`MediaReference`）形式出现，只有显式调用 `dataset.readMedia(reference)` 才会读取并返回编码字节；包本身不解码音频，PCM 解码是评测适配层的职责。

## 5. 通过窄 ModelAdapter 运行评测（模型调用与取消）

```ts
import { runEvaluation, type ModelAdapter } from "@memora/evaluation";

const model: ModelAdapter = {
  identity: {
    modelId: "whisper-base-timestamped",
    modelRevision: { status: "unknown" },
    adapter: "whisper",
    runtime: "transformers-js",
    inference: { language: "hi", priority: "background" },
  },
  async initialize(signal) {
    await preloadModel(signal);
  },
  async predict({ pcm, sampleRate }, signal) {
    return transcribe({ pcm, sampleRate, signal });
  },
};

const runController = new AbortController();
const result = await runEvaluation({
  dataset,
  model,
  signal: runController.signal,
  onProgress: ({ completed, total, result: example }) => {
    console.log(completed, total, example);
  },
});

// runController.abort() 停止后续请求，忽略迟到的结果；
// result.status 会是 "canceled"，result.examples 保留已完成的部分结果。
```

评测按顺序逐条调用模型；单条媒体或模型错误会记录在该条目上并继续下一条，只有初始化失败或数据集本身出错才会终止整个 run（此时 `result.status` 为 `"failed"`，附带顶层 `error` 字段）。`result.summary.wer` / `result.summary.cer` 已按 WER/CER 规范化规则（NFC、转小写、去除标点、去除首尾空白、合并连续空白）聚合——大小写与标点差异不计入错误，因为 FLEURS 等参考文本通常是无标点的小写文本，而模型输出天然带大小写和标点。失败条目不计入分母，分母为零时 `value` 为 `null` 并附 `reason: "zero-reference-units"`。

## 6. 保存评测结果并在之后读取

```ts
import {
  listEvaluationResults,
  readEvaluationResult,
  saveEvaluationResult,
} from "@memora/evaluation";

await saveEvaluationResult(result); // 单个 JSON 文档，写入 OPFS，以 result.runId 为文件名

// —— 页面刷新之后，没有任何内存中的 `result` 引用 ——

const summaries = await listEvaluationResults(); // 轻量摘要列表，按 startedAt 倒序
const reopened = await readEvaluationResult(summaries[0].runId); // 完整结果，逐条数据齐全
```

`saveEvaluationResult` 保存失败时会抛出 `EvaluationError`（`code: "save-failed"`），调用方必须据此明确报告失败，禁止把失败展示为“已保存”。`listEvaluationResults` 遇到无法解析或校验失败的文件会静默跳过，不会因为一份损坏的结果拖垮整个列表；直接对某个 `runId` 调用 `readEvaluationResult` 时，损坏的文件会抛出 `code: "invalid-result"`，从未保存过的 `runId` 会抛出 `code: "not-found"`。

结果文档中的下载：拿到 `EvaluationResult` 之后，`JSON.stringify(result, null, 2)` 就是可直接另存为 `.json` 文件的完整内容——`readEvaluationResult` 返回的对象与保存前完全一致。

## 不支持的情况、配额与关闭页面

- **不支持的仓库布局**：如果 Hub 仓库不包含声明式的 Parquet 文件（例如需要自定义 Python 加载脚本的数据集），`inspectDataset` 会以 `DatasetError`（`code: "unsupported"`）拒绝，而不是尝试猜测或下载整个仓库。
- **配额不足**：`installDataset` 在写入前会检查预计所需字节数与可用配额；写入过程中真的触发配额错误时，同样以 `DatasetError`（`code: "quota"`）拒绝，并清理本次未完成的文件。
- **使用中的数据不能被删除**：`openDataset` 返回的 handle 处于打开状态时，`deleteInstalledDataset` 会以 `code: "in-use"` 拒绝；调用 `dataset.close()` 后才能删除。
- **关闭页面 / 刷新**：两个包都不提供“页面关闭后自动恢复未完成任务”的能力。下载中途关闭页面，未完成的部分文件会在下次安装时被识别为不完整并重新下载；评测运行中途关闭页面，那次 run 不会被保存（`saveEvaluationResult` 需要先拿到 `runEvaluation` 的返回值才能调用），已保存的历史结果不受影响，随时可以用 `listEvaluationResults` / `readEvaluationResult` 重新查看。
