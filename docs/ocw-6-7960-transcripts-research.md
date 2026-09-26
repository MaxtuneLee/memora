# MIT OCW 6.7960 transcripts research

Question (issue #53, map #52): does MIT OCW 6.7960 Deep Learning (Fall 2024) publish official captions or transcripts for its lecture videos, and in what shape?

Checked 2026-09-26 against the OCW pages directly.

## Answer

Yes. Every published lecture video has two official files from OCW. The speaker labels and sound tags suggest a professional captioning service rather than raw ASR:

- A **WebVTT caption file** (`mit6_7960f24_lecNN_captions.vtt`) with cue-level timestamps.
- A **transcript PDF** (`mit6_7960f24_lecNN_transcript.pdf`) with the same text as flowing paragraphs and no timestamps.

Both are included in the course download package. No ASR pass is needed. The only work is parsing the VTT.

## Where they are

- Each video resource page (for example [Lec 01](https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/resources/mit6_7960f24_lec01_mp4/)) embeds the YouTube video and links the VTT as `<track kind="captions" src="/courses/6-7960-deep-learning-fall-2024/mit6_7960f24_lec01_captions.vtt" srclang="en" label="English" default>`, plus a "Download transcript" link to the PDF.
- Direct URL pattern: `https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/mit6_7960f24_{lecNN|review}_captions.vtt` and `..._transcript.pdf`.
- The [download page](https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/download/) offers `6.7960-fall-2024.zip` (235,000,290 bytes, 717 entries). Its `static_resources/` folder has all 24 `*_captions.vtt` and 24 `*_transcript.pdf` files, each also duplicated under a Google Drive-style ID name (`<id>_transcript.webvtt`, `<id>_transcript.pdf`, same byte sizes). The zip does **not** contain the MP4s. The download page links 360p MP4s for some lectures, and every lecture is on YouTube (IDs below).

## Format and timestamp granularity

VTT sample (Lec 01):

```
WEBVTT

00:00:00.000 --> 00:00:01.985 align:middle line:90%
[SQUEAKING]

00:00:13.180 --> 00:00:15.600 align:middle line:84%
SARA BEERY: So why
are we all here?
```

- Timestamps are at the cue level, with millisecond precision. Cues average **2.3 to 3.1 s** (about 2.7 s on average across all files) and hold one or two short caption lines, about 7 words per cue. There are no word-level timestamps.
- A speaker label appears at each change of speaker (`SARA BEERY:`, `PHILLIP ISOLA:`, `JEREMY BERNSTEIN:`, `AUDIENCE:`, a few guests). Across all files: AUDIENCE 610, Isola 242, Beery 227, Bernstein 153, Jacob Andreas 9, Jamison Meindl 2.
- Non-speech tags such as `[LAUGHS]`, `[INAUDIBLE]` and `[SQUEAKING]` appear, along with some empty cues during silence.
- The transcript PDF starts `MITOCW | mit6_7960f24_lec01.mp4`, then gives speaker-labelled paragraphs with no timestamps. It is useful for reading, not for alignment. Use the VTT as the source.

## Lectures and lengths

There are 24 videos: lectures 1–21, 23 and 24 (**Lecture 22 is not published**), plus a PyTorch tutorial. Length is the end time of the last VTT cue, which is a close lower bound on the video length. Cue and word counts come from our own parse of each VTT.

| # | Title | YouTube ID | Min | Cues | Words |
|---|---|---|---|---|---|
| 01 | Introduction to Deep Learning | 6FkRvTtUc-o | 60.9 | 1348 | 9888 |
| 02 | How to Train a Neural Net | vidCX_dMCu0 | 79.6 | 1720 | 12130 |
| 03 | Approximation Theory | ySaoWrv3T_Q | 82.7 | 1769 | 12647 |
| 04 | Architectures: Grids | bxVkZ4M-hIE | 83.9 | 1866 | 13578 |
| 05 | Architectures: Graphs | 0niIwb37nF0 | 81.2 | 1862 | 13607 |
| 06 | Generalization Theory | EiO8BBa-xdc | 80.5 | 1824 | 13478 |
| 07 | Scaling Rules for Optimization | VcGPE4s_oNw | 80.9 | 1673 | 12007 |
| 08 | Architectures: Transformers | Q1HOKrNeh2M | 74.6 | 1722 | 12675 |
| 09 | Hacker's Guide to Deep Learning | DC2Hw9DiLCg | 75.8 | 1954 | 13605 |
| 10 | Architectures: Memory | IiHknRHA-Gk | 73.5 | 1573 | 11613 |
| 11 | Representation Learning: Reconstruction-Based | QxOzQRtd440 | 81.1 | 1920 | 13878 |
| 12 | Representation Learning: Similarity-Based | yUh1fEGGdl4 | 76.3 | 1609 | 11810 |
| 13 | Representation Learning: Theory | -eC0-5mXHQg | 75.3 | 1435 | 9958 |
| 14 | Generative Models: Basics | hJlrAHqGOS8 | 81.3 | 2017 | 13870 |
| 15 | Generative Models: Representation Learning Meets Generative Modeling | 8zzfcYIELdo | 80.7 | 1816 | 13246 |
| 16 | Generative Models: Conditional Models | zaMcHuJwe1w | 81.5 | 1912 | 13635 |
| 17 | Generalization: Out-of-Distribution (OOD) | tjD9LIzIIek | 64.7 | 1368 | 10068 |
| 18 | Transfer Learning: Models | tNfuZ9Imt3M | 85.7 | 1838 | 13960 |
| 19 | Transfer Learning: Data | RUdQMHV-7KM | 75.7 | 1583 | 11882 |
| 20 | Scaling Laws | 7hbf4klU3ks | 38.4 | 859 | 6435 |
| 21 | Language Models | 9GWd3SAWLbA | 77.4 | 1731 | 13419 |
| 23 | Metrized Deep Learning | zBvsoxC6tAo | 67.8 | 1359 | 10007 |
| 24 | Inference Methods for Deep Learning | mbgFTqKxR7A | 83.2 | 1975 | 14346 |
| — | PyTorch Tutorial (`review`) | o5gPABcGZwc | 29.0 | 593 | 4651 |

The 23 lectures total about 1,743 min (29 h) and run 38 to 86 min each. Most run 74 to 84 min.

Source: the [lecture videos list](https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/resources/lecture-videos/) and each linked resource page.

## License for a locally used derived dataset

Course pages carry [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Summary from the [OCW terms of use](https://ocw.mit.edu/pages/privacy-and-terms-of-use/):

- **Attribution**: "give appropriate credit, provide a link to the license, and indicate if changes were made."
- **Noncommercial**: "You may not use the material for commercial purposes."
- **ShareAlike**: "If you remix, transform, or build upon the material, you must distribute your contributions under the same license." This applies only when we **distribute** the material. A dataset kept locally and never published triggers no ShareAlike obligation.
- **AI training** (OCW-specific clause): "Unless otherwise specified, OCW content may be used to train, develop, and improve artificial intelligence and machine learning models," subject to attribution in training documentation, non-commercial use only, and CC BY-NC-SA 4.0 for any derivative model or system that is distributed.

For Memora's use (a local evaluation dataset that is not published), this is permitted. Keep a source and license note next to the data (course, lecture, URL, CC BY-NC-SA 4.0, "modified: parsed from VTT"). If the dataset or anything derived from it is ever published, it must be released under CC BY-NC-SA 4.0 and cannot be used commercially.

## Fallback (not needed)

The question asked for an ASR-plus-review estimate in case no official transcripts existed. Official VTT files exist for every lecture, so this estimate is moot.
