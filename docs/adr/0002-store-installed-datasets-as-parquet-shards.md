# Store installed datasets as Parquet shards

Every dataset source resolves to a common manifest, and installed datasets retain immutable Parquet shards for the selected configuration and splits. This preserves compatible Hugging Face artifacts, supports typed schemas and bounded column or row reads, and avoids mandatory browser-side conversion or a custom binary format; media remains encoded and is exposed through lazy media references.
