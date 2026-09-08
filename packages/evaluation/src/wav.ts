export interface DecodedWav {
  pcm: Float32Array;
  sampleRate: number;
}

const text = (view: DataView, offset: number, length: number): string =>
  String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));

export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 44 || text(view, 0, 4) !== "RIFF" || text(view, 8, 4) !== "WAVE") {
    throw new Error("Audio must be a RIFF/WAVE file.");
  }
  let offset = 12;
  let format: { code: number; channels: number; sampleRate: number; bits: number } | undefined;
  let dataOffset = 0;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const chunk = text(view, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + length > view.byteLength) throw new Error("WAV chunk exceeds the file length.");
    if (chunk === "fmt ") {
      if (length < 16) throw new Error("WAV format chunk is incomplete.");
      format = {
        code: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (chunk === "data") {
      dataOffset = body;
      dataLength = length;
    }
    offset = body + length + (length % 2);
  }
  if (!format || dataLength === 0) throw new Error("WAV format or data chunk is missing.");
  if (format.channels !== 1)
    throw new Error(`WAV must be mono; received ${format.channels} channels.`);
  if (format.sampleRate !== 16_000)
    throw new Error(`WAV must use a 16000 Hz sample rate; received ${format.sampleRate} Hz.`);
  if (!((format.code === 1 && format.bits === 16) || (format.code === 3 && format.bits === 32))) {
    throw new Error(`Unsupported WAV encoding: format ${format.code}, ${format.bits}-bit.`);
  }
  const bytesPerSample = format.bits / 8;
  if (dataLength % bytesPerSample !== 0) throw new Error("WAV sample data is misaligned.");
  const pcm = new Float32Array(dataLength / bytesPerSample);
  for (let index = 0; index < pcm.length; index += 1) {
    const sampleOffset = dataOffset + index * bytesPerSample;
    pcm[index] =
      format.code === 1
        ? view.getInt16(sampleOffset, true) / 32768
        : view.getFloat32(sampleOffset, true);
    if (!Number.isFinite(pcm[index])) throw new Error("WAV contains a non-finite PCM sample.");
  }
  return { pcm, sampleRate: format.sampleRate };
}
