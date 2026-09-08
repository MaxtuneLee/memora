# Memora datasets and evaluation

This context describes how Memora names reusable evaluation data and the process that consumes it. A dataset remains the same logical resource regardless of where it is published or stored.

## Language

**Dataset**:
A named collection of examples that share a feature schema and may contain configurations and splits. Its identity is independent of its source and local storage state.
_Avoid_: Benchmark, data package

**Dataset source**:
An external origin from which a dataset can be obtained, such as Hugging Face Hub.
_Avoid_: Dataset, cache

**Dataset revision**:
An immutable published state of a dataset. A moving source reference such as a branch or tag is resolved to a dataset revision before installation or evaluation.
_Avoid_: Version, latest

**Dataset manifest**:
A serializable description of one dataset revision, including its configurations, splits, feature schemas, downloadable content, sizes, and integrity information. Every dataset source is resolved into this common description.
_Avoid_: Dataset card, file listing

**Dataset configuration**:
A named variant of a dataset that selects a coherent subset or representation, such as one FLEURS language or all languages.
_Avoid_: Variant, flavor, subset

**Split**:
A named partition within a dataset configuration, such as train, validation, or test. Split names are defined by the dataset and are not limited to a fixed list.
_Avoid_: Partition, group

**Example**:
One schema-conforming record in a split. An example may reference media whose bytes are read or decoded only when requested.
_Avoid_: Row, sample, item

**Installed dataset**:
A complete, verified local copy of selected content from one dataset revision that is available without its dataset source.
_Avoid_: Cache, download

**Media reference**:
A serializable value that identifies encoded media belonging to an example and carries known media metadata without loading or decoding its bytes.
_Avoid_: Blob, decoded media

**Feature schema**:
A serializable description of the values an example may contain, including logical types such as class labels and media in addition to their physical storage types.
_Avoid_: TypeScript type, Parquet schema

**Evaluation**:
A model-independent process that consumes examples, obtains predictions through an injected model adapter, and produces measurements and results.
_Avoid_: Dataset, inference

**Model adapter**:
The boundary through which an evaluation obtains predictions without depending on a specific model implementation or application.
_Avoid_: Model, runtime

**Model identity**:
A serializable description of the model, adapter, revision, runtime, and inference settings that can affect predictions in an evaluation run.
_Avoid_: Model name, display name

**Metric**:
A versioned definition that turns accepted example results into a named measurement for an evaluation run.
_Avoid_: Result, score field

**Normalization profile**:
A versioned set of rules that converts predictions and references into the representation consumed by a metric.
_Avoid_: Preprocessing, cleanup

**Evaluation run**:
One execution of an evaluation against a fixed dataset revision, model identity, and evaluation configuration.
_Avoid_: Job, session, benchmark

**Example result**:
The accepted outcome for one example in an evaluation run, including its prediction or error and the measurements needed for aggregation. Retries are attempts to produce this single result, not additional results.
_Avoid_: Model event, checkpoint
