export const downsample = (
  input: Float32Array,
  inputRate: number,
  outputRate: number
) => {
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const idx = Math.floor(i * ratio);
    output[i] = input[idx];
  }

  return output;
};