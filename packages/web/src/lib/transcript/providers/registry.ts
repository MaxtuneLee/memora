import type { TranscriptionProvider } from "./types";

export class TranscriptionProviderRegistry {
  private readonly providers = new Map<string, TranscriptionProvider>();

  register(provider: TranscriptionProvider): void {
    if (this.providers.has(provider.adapterId))
      throw new Error(`Transcription adapter already registered: ${provider.adapterId}`);
    this.providers.set(provider.adapterId, provider);
  }

  get(adapterId: string): TranscriptionProvider {
    const provider = this.providers.get(adapterId);
    if (!provider) throw new Error("The selected transcription adapter is not configured.");
    return provider;
  }
}
