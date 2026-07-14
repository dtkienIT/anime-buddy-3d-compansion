import type { CharacterController } from "../character/CharacterController.js";
import type { AudioPlayer } from "./AudioPlayer.js";
import type { AudioQueue } from "./AudioQueue.js";
import type { TtsClient } from "./TtsClient.js";
import type { VoiceSettings } from "./VoiceSettings.js";

export class InteractionVoice {
  private generation = 0;
  private active = false;

  constructor(
    private readonly tts: TtsClient,
    private readonly audioQueue: AudioQueue,
    private readonly audioPlayer: AudioPlayer,
    private readonly character: CharacterController,
    private readonly onWarning: (message: string) => void
  ) {}

  async speak(text: string, settings: VoiceSettings): Promise<void> {
    if (!settings.enabled) return;

    const generation = ++this.generation;
    this.active = true;

    try {
      await this.audioQueue.playChunks(
        [text],
        this.audioPlayer,
        (chunkText, signal) => this.tts.synthesize(chunkText, settings, signal),
        () => {
          if (generation !== this.generation) return;
          const analyser = this.audioPlayer.getAnalyser();
          if (analyser) {
            this.character.attachLipSyncAnalyser(analyser);
            this.character.startLipSync();
          }
        }
      );
    } catch (error) {
      if (generation === this.generation && !isAbortError(error)) {
        this.onWarning("Không thể phát giọng cho phản ứng lúc này.");
      }
    } finally {
      if (generation === this.generation) {
        this.active = false;
        this.character.stopLipSync();
      }
    }
  }

  cancel(): void {
    if (!this.active) return;
    this.generation += 1;
    this.active = false;
    this.audioQueue.cancel();
    this.audioPlayer.stop();
    this.character.stopLipSync();
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
