class PCMProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]) {
    const input = inputs[0];
    if (input && input[0]) {
      const channelData = input[0];
      // Copy to avoid transferring a view backed by the underlying buffer
      this.port.postMessage(channelData.slice(0));
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
