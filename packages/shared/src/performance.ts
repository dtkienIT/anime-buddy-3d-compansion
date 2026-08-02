export type PerformanceId = "bling-bang-bang-born" | "aipai-dance-hall" | "cham-vao-binh-minh" | "ui-mugibatake-dance";
export type PerformanceKind = "dance" | "sing";
export type PerformanceStageTheme = "neon-cube" | "lantern-festival" | "aurora-dawn" | "wheat-field";

export interface PerformanceRegistryItem {
  id: PerformanceId;
  label: string;
  artistLabel: string;
  kind: PerformanceKind;
  stageTheme: PerformanceStageTheme;
  stageLabel: string;
  description: string;
  animationUrl: string;
  audioUrl: string | null;
  startSeconds: number;
  durationSeconds: number;
  loopAnimation: boolean;
  microphone: boolean;
  featured: boolean;
}

export const performanceRegistry: readonly PerformanceRegistryItem[] = [
  {
    id: "bling-bang-bang-born",
    label: "Bling-Bang-Bang-Born",
    artistLabel: "Power dance",
    kind: "dance",
    stageTheme: "neon-cube",
    stageLabel: "Neon Cube Arena",
    description: "Hip-hop bùng nổ giữa sàn LED, khối sáng treo và laser vàng đỏ.",
    animationUrl: "/animations/Bling-Bang-Bang-Born.vrma",
    audioUrl: "/audio/music/Bling-Bang-Bang-Born.mp3",
    startSeconds: 0,
    durationSeconds: 19.167,
    loopAnimation: false,
    microphone: false,
    featured: true
  },
  {
    id: "aipai-dance-hall",
    label: "Aipai Dance Hall",
    artistLabel: "Festival dance",
    kind: "dance",
    stageTheme: "lantern-festival",
    stageLabel: "Moon Lantern Festival",
    description: "Sân khấu lễ hội Á Đông với nguyệt môn, đèn lồng và cánh hoa chuyển động.",
    animationUrl: "/animations/Aipai-Dance-Hall.vrma",
    audioUrl: "/audio/music/Aipai-Dance-Hall.mp3",
    startSeconds: 0,
    durationSeconds: 32.7,
    loopAnimation: false,
    microphone: false,
    featured: true
  },
  {
    id: "cham-vao-binh-minh",
    label: "Chạm Vào Bình Minh",
    artistLabel: "Original vocal",
    kind: "sing",
    stageTheme: "aurora-dawn",
    stageLabel: "Aurora Dawn",
    description: "Một màn hát giàu cảm xúc trên sân khấu bình minh, cực quang và sao trời.",
    animationUrl: "/animations/Singing.vrma",
    audioUrl: "/audio/music/Cham-Vao-Binh-Minh.mp3",
    startSeconds: 0,
    durationSeconds: 180,
    loopAnimation: true,
    microphone: true,
    featured: true
  },
  {
    id: "ui-mugibatake-dance",
    label: "Vũ điệu Uimugi Batake",
    artistLabel: "Original hyper remix",
    kind: "dance",
    stageTheme: "wheat-field",
    stageLabel: "Golden Wheatlight",
    description: "Hyper remix 179 BPM với bass nhanh, vocal hook tiếng Việt, snare roll và drop điện tử dồn dập.",
    animationUrl: "/animations/UiMugibatake.vrma",
    audioUrl: "/audio/music/Golden-Wheatlight-Original.mp3",
    startSeconds: 0,
    durationSeconds: 26.8,
    loopAnimation: false,
    microphone: false,
    featured: false
  }
] as const;

export function getPerformanceById(id: string | undefined | null): PerformanceRegistryItem | undefined {
  return performanceRegistry.find((performance) => performance.id === id);
}

export function toPerformanceCatalogItem(performance: PerformanceRegistryItem) {
  return {
    id: performance.id,
    label: performance.label,
    artistLabel: performance.artistLabel,
    kind: performance.kind,
    stageTheme: performance.stageTheme,
    stageLabel: performance.stageLabel,
    description: performance.description,
    durationSeconds: performance.durationSeconds,
    microphone: performance.microphone,
    featured: performance.featured,
    mediaMode: performance.audioUrl ? "local-audio" : "motion-only"
  };
}
