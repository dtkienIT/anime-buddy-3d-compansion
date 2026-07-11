export type AnimationCategory = "idle" | "thinking" | "talking" | "reaction" | "gesture";

export interface CharacterRegistryItem {
  id: string;
  label: string;
  url: string;
  targetHeight?: number;
  rotationY?: number;
  yOffset?: number;
  scaleMultiplier?: number;
}

export interface AnimationRegistryItem {
  id: string;
  label: string;
  url: string;
  loop: boolean;
  fadeDuration: number;
  category: AnimationCategory;
  fallbackId: string;
}

export interface BackgroundRegistryItem {
  id: string;
  label: string;
  url: string;
}

export const defaultCharacterId = "mika";
export const defaultAnimationId = "relax";
export const defaultBackgroundId = "study-room-sunlit";

export const characterRegistry: CharacterRegistryItem[] = [
  { id: "mika", label: "Mika", url: "/models/8590256991748008892.vrm" },
  { id: "kato", label: "Kato", url: "/models/8329890252317737768.vrm" },
  { id: "sam", label: "Sam", url: "/models/sample.vrm" },
  { id: "vivi", label: "Vivi", url: "/models/vita.vrm" },
  { id: "tita", label: "Tita", url: "/models/vivi.vrm" },
  { id: "luna", label: "Luna", url: "/models/6493143135142452442.vrm" },
  { id: "naruto", label: "Naruto", url: "/models/naruto.vrm" },
  { id: "changli", label: "Changli", url: "/models/Changli.vrm" },
  { id: "yinlin", label: "Yinlin", url: "/models/Yinlin.vrm" },
  { id: "carlotta", label: "Carlotta", url: "/models/Carlotta.vrm" }
];

export const animationRegistry: AnimationRegistryItem[] = [
  { id: "greeting", label: "Greeting", url: "/animations/Greeting.vrma", loop: false, fadeDuration: 0.18, category: "gesture", fallbackId: "relax" },
  { id: "relax", label: "Relax", url: "/animations/Relax.vrma", loop: true, fadeDuration: 0.2, category: "idle", fallbackId: "relax" },
  { id: "thinking", label: "Thinking", url: "/animations/Thinking.vrma", loop: true, fadeDuration: 0.18, category: "thinking", fallbackId: "relax" },
  { id: "shake-head", label: "Shake Head", url: "/animations/ShakeHead.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "dance-25", label: "Dance 25", url: "/animations/Dance25.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "welcome-pose", label: "Welcome Pose", url: "/animations/WelcomePose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "cute-pose", label: "Cute Pose", url: "/animations/CutePose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "victory-pose", label: "Victory Pose", url: "/animations/VictoryPose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "presentation-pose", label: "Presentation Pose", url: "/animations/PresentationPose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "motion-pose", label: "Motion Pose", url: "/animations/MotionPose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "dogeza", label: "Dogeza", url: "/animations/Dogeza.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "step-exercise", label: "Step Exercise", url: "/animations/StepExercise.vrma", loop: true, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "hello", label: "Hello", url: "/animations/Hello.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "smartphone", label: "Smartphone", url: "/animations/Smartphone.vrma", loop: true, fadeDuration: 0.16, category: "idle", fallbackId: "relax" },
  { id: "drink-water", label: "Drink Water", url: "/animations/DrinkWater.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "encourage", label: "Encourage", url: "/animations/Encourage.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "startled", label: "Startled", url: "/animations/Startled.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "look-around", label: "Look Around", url: "/animations/LookAround.vrma", loop: false, fadeDuration: 0.18, category: "idle", fallbackId: "relax" },
  { id: "clapping", label: "Clapping", url: "/animations/Clapping.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "goodbye", label: "Goodbye", url: "/animations/Goodbye.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "jump", label: "Jump", url: "/animations/Jump.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "angry", label: "Angry", url: "/animations/Angry.vrma", loop: false, fadeDuration: 0.14, category: "reaction", fallbackId: "relax" },
  { id: "blush", label: "Blush", url: "/animations/Blush.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "sad", label: "Sad", url: "/animations/Sad.vrma", loop: false, fadeDuration: 0.18, category: "reaction", fallbackId: "relax" },
  { id: "sleepy", label: "Sleepy", url: "/animations/Sleepy.vrma", loop: false, fadeDuration: 0.2, category: "reaction", fallbackId: "relax" },
  { id: "surprised", label: "Surprised", url: "/animations/Surprised.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "peace", label: "Peace", url: "/animations/Peace.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "shoot", label: "Shoot", url: "/animations/Shoot.vrma", loop: false, fadeDuration: 0.12, category: "gesture", fallbackId: "relax" },
  { id: "spin", label: "Spin", url: "/animations/Spin.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "pose", label: "Pose", url: "/animations/Pose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "squat", label: "Squat", url: "/animations/Squat.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "vrma-01", label: "VRMA 01", url: "/animations/vrma_01.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" }
];

export const backgroundRegistry: BackgroundRegistryItem[] = [
  { id: "study-room-sunlit", label: "Study Room", url: "/backgrounds/study-room-sunlit.png" },
  { id: "cozy-night", label: "Cozy Night", url: "/backgrounds/cozy-night.png" },
  { id: "cozy-lounge", label: "Cozy Lounge", url: "/backgrounds/cozy-lounge.png" },
  { id: "pastel-study", label: "Pastel Study", url: "/backgrounds/pastel-study.png" },
  { id: "forest-path-bright", label: "Forest Path", url: "/backgrounds/forest-path-bright.png" },
  { id: "lake-meadow-bright", label: "Lake Meadow", url: "/backgrounds/lake-meadow-bright.png" },
  { id: "neon-tech", label: "Neon Tech", url: "/backgrounds/neon-tech.png" }
];

export function getAnimationById(id: string | undefined | null): AnimationRegistryItem {
  return animationRegistry.find((animation) => animation.id === id) ?? animationRegistry.find((animation) => animation.id === defaultAnimationId)!;
}

export function getCharacterById(id: string | undefined | null): CharacterRegistryItem {
  return characterRegistry.find((character) => character.id === id) ?? characterRegistry.find((character) => character.id === defaultCharacterId)!;
}

export function getBackgroundById(id: string | undefined | null): BackgroundRegistryItem {
  return backgroundRegistry.find((background) => background.id === id) ?? backgroundRegistry.find((background) => background.id === defaultBackgroundId)!;
}

export function resolveSafeAnimationId(candidate: string | undefined | null, allowedIds?: string[]): string {
  const available = new Set(animationRegistry.map((animation) => animation.id));
  const clientAllowed = allowedIds?.length ? new Set(allowedIds.filter((id) => available.has(id))) : available;
  if (candidate && clientAllowed.has(candidate)) {
    return candidate;
  }
  return clientAllowed.has(defaultAnimationId) ? defaultAnimationId : [...clientAllowed][0] ?? defaultAnimationId;
}
