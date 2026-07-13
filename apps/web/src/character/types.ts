import type { AnimationRegistryItem, CharacterRegistryItem } from "@anime-buddy/shared";

export type VrmInstance = any;

export interface PlayAnimationOptions {
  loop?: boolean;
  autoIdle?: boolean;
  fadeDuration?: number;
  maxDurationMs?: number;
}

export interface CharacterSelection {
  character: CharacterRegistryItem;
  animation: AnimationRegistryItem;
}
