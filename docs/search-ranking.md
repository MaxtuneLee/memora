# Search palette content ranking

How the search palette (Cmd/Ctrl+K) ranks content matches since EmbeddingGemma 2, why it changed, and how to recalibrate it. The code is `searchContent` in `packages/web/src/lib/search/contentSearchService.ts`; tests are in `packages/web/test/search/contentSearchService.test.ts`.

## Pipeline

The palette shows two groups, one after the other:

1. **Name matches** (settings, folders, files, chats), scored by `rankSearchItems` in `searchRanking.ts`: exact title, title prefix, word prefix, substring, then keyword matches. This is unchanged.
2. **Content matches**, from `searchContent` with `standoutOnly: true`, once the query has 2 or more characters:
   - **Lexical:** SQLite FTS5 BM25 over 256-character chunks, top 40.
   - **Semantic:** the query embedded with EmbeddingGemma 2 (`task: search result | query: ` prefix), nearest chunks by cosine distance in sqlite-vec, top 300. Images also have one picture vector each (chunk ID `<fileId>:image`), which lets text queries find photos by what they show.
   - Semantic hits are filtered (below), both lists are fused, and the top 8 chunks are shown. Adjacent chunks of one file are merged into one result.

The `semanticSearchMode` setting picks the lists: `bm25` lexical only, `hybrid` both, `bge` semantic only.

## What was wrong

Measured on a real library (about 300 chunks of notes, lecture transcripts, PDFs, and a few images):

- **Every chunk is close to every query.** For "a busy street", every semantic hit had a cosine similarity between 0.62 and 0.70 (distance 0.30–0.38). Nearest-neighbor search always returns 40 hits, and nothing set a floor, so unrelated files always filled the list.
- **Tiny chunks come out nearest.** One-word chunks such as "Open", "Done", "Today Tasks", or "test" sit near the center of the embedding space and were closer to "a busy street" (similarity 0.70) than the photo of a busy crossing (0.69).
- **Rank fusion ignored how strong a match was.** Reciprocal rank fusion (`1 / (60 + rank)` per list) made a PDF chunk that matched "camera" by keyword and weakly by meaning (similarity 0.64) outrank a camera photo that matched far better (0.77) but only semantically.
- **Text and pictures aren't on one scale.** Text-to-text similarities run higher than text-to-image ones, so raw distances can't be compared across the two.

## How it ranks now

### 1. Drop very short chunks from semantic matching

A chunk with fewer than 12 meaningful characters (punctuation, symbols, and spaces removed; a Han character counts as 3) isn't a semantic match. Lexical search still finds it. Picture vectors are exempt, since their caption is only the file name.

### 2. Keep only hits that stand out from this query's background

Of the remaining candidates, compute the median distance and the median absolute deviation (MAD, scaled by 1.4826). Keep a hit only if it is closer than the median by at least 3 MADs:

```text
cutoff = median − 3 × 1.4826 × MAD
```

- The cutoff adapts per query, which a fixed similarity threshold can't do when every query's distances sit in a different narrow band.
- Median and MAD barely move when many chunks really match. With 10 matches among 40 candidates, a mean and standard deviation cutoff dropped all 10; median and MAD kept all of them.
- The pool is 300 candidates, so unrelated chunks stay the majority and the median stays a fair baseline even when a topic covers 100 chunks. In a small library the pool is every chunk.
- With fewer than 10 candidates there's no baseline, so semantic hits are skipped and only lexical hits show.

Each kept hit is scored by how many MADs it stands out (the "semantic strength").

### 3. Fuse by score, not rank

```text
score = semantic strength (0 if not a semantic match)
      + 3 × BM25 / best BM25 in this query (0 if not a lexical match)
```

- The best keyword hit counts as much as a semantic hit right at the cutoff, so every semantic match ranks above keyword-only hits.
- A chunk found both ways adds the two and usually leads.
- The weight started at 6, but BM25 scores of a short query are often close together, so every keyword hit scored about 6 and pushed a matching painting (5.7) out of the top 8. It is now 3.

### Effect on the measured queries

| Query           | Before                                                   | After (replayed in tests)                                                   |
| --------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| "a busy street" | "Today Tasks", "test", and others above the street photo | Only the street photo passes the semantic filter                            |
| "camera"        | A PDF chunk matching the keyword first                   | The camera photo first (strength about 18), the PDF chunk second (about 12) |

"Before" is what the palette showed. "After" comes from tests that replay the measured distances ("a busy street" exactly, "camera" in shape), not from a new run in the browser.

## The assistant's search is unchanged

The chat tool `search_files` calls `searchContent` without `standoutOnly`: top 40 semantic hits, no filtering, and reciprocal rank fusion. The assistant reads and judges results itself, so recall matters more than a short clean list, and a search scoped to one or two referenced files often has fewer than 10 candidates, where filtering would turn semantic search off. Run the agent evaluation (`docs/EVAL.md`) before switching it over.

## Image previews

Image results (an image file by name, or an image's content match) show the picture in a 44 × 44 tile in place of the file icon, using the file's thumbnail if it has one. Every row uses the same tile, so they line up.

## Recalibrating

The constants are at the top of `contentSearchService.ts`:

| Constant                | Value        | Raise it to                               | Lower it to             |
| ----------------------- | ------------ | ----------------------------------------- | ----------------------- |
| `MATCH_MADS`            | 3            | show fewer, more certain semantic matches | show more, noisier ones |
| `MIN_MEANINGFUL_LENGTH` | 12           | drop longer headings                      | keep short chunks       |
| `LEXICAL_MATCH_WEIGHT`  | `MATCH_MADS` | favor keyword matches                     | favor semantic matches  |
| `SEMANTIC_POOL`         | 300          | steady the baseline in large libraries    | search faster           |

To see real numbers, log the semantic hits' `vectorDistance` (similarity is `1 − distance`) and the fused scores for a few queries: a word in the text, something only an image shows, and a word the library doesn't have. A new embedding model needs this again: its distance band and spread will differ.

## Known limits

- Content matches are still listed after all name matches, whatever their score.
- Weak but relevant text matches (for "camera", a passage about f-stops at similarity 0.62) can't be told from unrelated text at the same similarity, so some are dropped and some unrelated ones pass. They rank low and are often cut by the top 8.
- The cutoff was calibrated on one library with two queries in depth.
