import { animationRegistry } from "@anime-buddy/shared";

export function getAvailableAnimationIds(): string[] {
  return animationRegistry
    .filter((animation) => animation.chatEligible !== false && animation.requiresProp !== true)
    .map((animation) => animation.id);
}
