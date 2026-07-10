import { animationRegistry } from "@anime-buddy/shared";

export function getAvailableAnimationIds(): string[] {
  return animationRegistry.map((animation) => animation.id);
}
