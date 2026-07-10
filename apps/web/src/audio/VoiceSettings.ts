export interface VoiceSettings {
  enabled: boolean;
  voice: string;
  style: string;
}

export const defaultVoiceSettings: VoiceSettings = {
  enabled: true,
  voice: "Trúc Ly",
  style: "tu_nhien"
};
