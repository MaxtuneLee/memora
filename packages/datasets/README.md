# @memora/datasets

Browser-first access to public, declarative Parquet datasets on Hugging Face Hub. The package resolves moving revisions to a commit SHA, installs selected splits in OPFS, and opens them later without network access. It has no dependency on React or `@memora/web`.

## Inspect and install

```ts
import { inspectDataset, installDataset } from "@memora/datasets";

const inspection = await inspectDataset("google/fleurs", { revision: "main" });
const hindi = inspection.configurations.find((configuration) => configuration.name === "hi_in");
const test = hindi?.splits.find((split) => split.name === "test");

console.log(test?.examples, test?.size, inspection.revision);

await installDataset(inspection, {
  configuration: "hi_in",
  splits: ["test"],
  onProgress: ({ completedBytes, totalBytes }) => {
    console.log(`${completedBytes} / ${totalBytes}`);
  },
});
```

Inspection reads repository metadata and Parquet footers. It does not download complete shards. A branch or tag is resolved once; metadata and file downloads use the returned `inspection.revision` commit SHA.

## Open offline and iterate

```ts
import { openDataset } from "@memora/datasets";

const dataset = await openDataset({
  datasetId: "google/fleurs",
  revision: inspection.revision,
  configuration: "hi_in",
  split: "test",
});

console.log(dataset.features, dataset.length);

for await (const example of dataset) {
  console.log(example.transcription, example.lang_id);
  break;
}

for await (const batch of dataset.batches(16)) {
  // The final batch is kept by default. Pass { dropLast: true } to omit it.
  await consume(batch);
}

dataset.close();
```

`loadDataset` combines inspection, installation, and opening when online setup is desired. `openDataset` only reads the installed split and does not contact Hub.

## Read audio on demand

Audio values yielded by iteration are media references. Encoded bytes are read only when requested.

```ts
const first = (await dataset.batches(1)[Symbol.asyncIterator]().next()).value?.[0];
if (first?.audio?.type === "media") {
  const audio = await dataset.readMedia(first.audio);
  console.log(audio.mimeType, audio.bytes.byteLength);
}
```

The package returns encoded media and does not decode audio to PCM. Callers performing ASR should decode at their model-adapter boundary.

## Manage installations

Use `listInstalledDatasets()` to enumerate complete splits and `deleteInstalledDataset(selection)` for explicit removal. Incomplete downloads are hidden. Retrying downloads the incomplete file from the beginning while reusing files that already pass size and Parquet validation. A dataset cannot be deleted while an open handle is using it.

Install operations accept an `AbortSignal`. Storage quota, cancellation, unsupported layout, network, and incomplete-installation failures are exposed through `DatasetError.code`.

## Supported scope

The first release supports public Hub datasets whose repository contains declarative Parquet files. Private or gated repositories, Python dataset builders, arbitrary source formats, byte-range download resume, decoded media, and cross-revision cleanup are outside its scope.
