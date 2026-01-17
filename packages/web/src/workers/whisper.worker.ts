import {
  pipeline,
  env,
  type ProgressCallback,
} from "@huggingface/transformers";
import {
  file as opfsFile,
  write as opfsWrite,
  dir as opfsDir,
} from "opfs-tools";

const WHISPER_TIMESTAMPED_MODEL = "onnx-community/whisper-base_timestamped";

type TimestampedTranscription = {
  text: string;
  chunks?: Array<{ text: string; timestamp: [number, number] }>;
};

type Transcriber = (
  audio: Float32Array,
  options: {
    language?: string;
    return_timestamps?: "word";
    chunk_length_s?: number;
  }
) => Promise<TimestampedTranscription>;

// Custom cache backend using OPFS for persistent storage
class OPFSCache {
  static async match(request: string): Promise<Response | undefined> {
    console.log("OPFSCache match called for", request);

    const url = new URL(request);
    const pathname = url.pathname;

    try {
      // Check if file exists in OPFS
      const opfsPath = `/transformers-cache${pathname}`;
      if (await opfsFile(opfsPath).exists()) {
        const data = await opfsFile(opfsPath).arrayBuffer();
        console.log("OPFS cache hit for", opfsPath);
        return new Response(data, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
    } catch (error) {
      console.warn("OPFS cache match error:", error);
    }

    return undefined;
  }

  static async put(request: string, response: Response): Promise<void> {
    const url = new URL(request);
    const pathname = url.pathname;

    try {
      const opfsPath = `/transformers-cache${pathname}`;

      // Ensure directory exists
      const dirPath = opfsPath.substring(0, opfsPath.lastIndexOf("/"));
      await opfsDir(dirPath).create();

      // Clone response to read body
      const clonedResponse = response.clone();
      const arrayBuffer = await clonedResponse.arrayBuffer();

      console.log("OPFS caching", opfsPath);

      // Write to OPFS
      await opfsWrite(opfsPath, arrayBuffer);
    } catch (error) {
      console.error("OPFS cache put error:", error);
    }
  }
}

// Configure transformers.js to use OPFS cache
env.useCustomCache = true;
env.customCache = OPFSCache;

/**
 * This class uses the Singleton pattern to ensure that only one instance of the
 * model is loaded. Uses OPFS for persistent caching via custom cache backend.
 */
class AutomaticSpeechRecognitionPipeline {
  static model_id = WHISPER_TIMESTAMPED_MODEL;
  static instance: Transcriber | null = null;

  static async getInstance(
    progress_callback: ProgressCallback
  ): Promise<Transcriber> {
    if (!this.instance) {
      console.log("[Worker] Loading ASR pipeline model...");
      this.instance = (await pipeline(
        "automatic-speech-recognition",
        this.model_id,
        {
          progress_callback,
          dtype: {
            encoder_model: "fp32",
            decoder_model_merged: "q4",
          },
          device: "webgpu",
        }
      )) as unknown as Transcriber;
      console.log("[Worker] ASR pipeline model loaded.");
    }

    return this.instance;
  }
}

let processing = false;

async function generate({
  audio,
  language,
}: {
  audio: Float32Array;
  language: string;
}) {
  console.log(
    "[Worker] Generate called, processing:",
    processing,
    "audio length:",
    audio.length,
    "language:",
    language
  );

  if (processing) {
    console.log("[Worker] Already processing, skipping");
    return;
  }
  processing = true;

  // Tell the main thread we are starting
  console.log("[Worker] Sending start message");
  self.postMessage({ status: "start" });

  const transcriber = await AutomaticSpeechRecognitionPipeline.getInstance(
    (x) => {
      console.log("[Worker] Pipeline load progress:", x);
      self.postMessage(x);
    }
  );

  console.log("[Worker] Transcribing with timestamps");
  const result = await transcriber(audio, {
    language,
    return_timestamps: "word",
    chunk_length_s: 30,
  });

  console.log("[Worker] Generation complete, output:", result.text);
  self.postMessage({
    status: "complete",
    output: result.text,
    chunks: result.chunks,
    audio_length: audio.length,
  });

  processing = false;
  console.log("[Worker] Processing flag cleared");
}

async function load() {
  self.postMessage({
    status: "loading",
    data: "Loading model...",
  });

  // Load the pipeline and save it for future use.
  try {
    const transcriber = await AutomaticSpeechRecognitionPipeline.getInstance(
      (x) => {
        // We also add a progress callback to the pipeline so that we can
        // track model loading.
        console.log("[Worker] Pipeline load progress:", x);
      }
    );
    console.log("[Worker] Model loaded:", transcriber);

    self.postMessage({
      status: "loading",
      data: "Compiling shaders and warming up model...",
    });

    console.log("[Worker] Warming up model with dummy input");

    await transcriber(new Float32Array(16_000), {
      return_timestamps: "word",
    });

    self.postMessage({ status: "ready" });
  } catch (e) {
    console.error("[Worker] Error loading model:", e);
    self.postMessage({
      status: "error",
      data: "Error loading model",
    });
    return;
  }
}

// Listen for messages from the main thread
self.addEventListener("message", async (e: MessageEvent) => {
  const { type, data } = e.data;
  console.log(
    "[Worker] Received message, type:",
    type,
    "data:",
    data ? Object.keys(data) : "none"
  );

  switch (type) {
    case "load":
      console.log("[Worker] Loading model...");
      load();
      break;
    case "generate":
      console.log("[Worker] Starting generation...");
      generate(data);
      break;
  }
});
