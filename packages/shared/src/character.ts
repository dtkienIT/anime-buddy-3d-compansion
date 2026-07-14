export type AnimationCategory = "idle" | "listening" | "thinking" | "talking" | "reaction" | "gesture";

export interface CharacterRegistryItem {
  id: string;
  label: string;
  url: string;
  description?: string;
  persona?: string;
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
  description?: string;
  chatEligible?: boolean;
  requiresProp?: boolean;
}

export interface BackgroundRegistryItem {
  id: string;
  label: string;
  url: string;
  description?: string;
}

export const defaultCharacterId = "mika";
export const defaultAnimationId = "relax";
export const defaultBackgroundId = "study-room-sunlit";

export const characterRegistry: CharacterRegistryItem[] = [
  { id: "mika", label: "Mika", description: "Ấm áp & tinh tế", persona: "Lắng nghe kỹ, phản hồi dịu dàng, tinh tế và tạo cảm giác an toàn.", url: "/models/8590256991748008892.vrm" },
  { id: "kato", label: "Kato", description: "Điềm tĩnh & gần gũi", persona: "Bình tĩnh, thực tế, nói rõ ràng và giúp người dùng nhìn vấn đề nhẹ nhàng hơn.", url: "/models/8329890252317737768.vrm" },
  { id: "sam", label: "Sam", description: "Tươi sáng & năng động", persona: "Nhiều năng lượng, chủ động khích lệ và dùng nhịp trò chuyện nhanh nhưng không ồn ào.", url: "/models/sample.vrm" },
  { id: "vivi", label: "Vivi", description: "Dịu dàng & đáng yêu", persona: "Mềm mại, quan tâm đến cảm xúc và thể hiện sự đáng yêu một cách tự nhiên.", url: "/models/vita.vrm" },
  { id: "tita", label: "Tita", description: "Vui vẻ & tự nhiên", persona: "Thoải mái, hài hước vừa đủ và trò chuyện như một người bạn thân thiện.", url: "/models/vivi.vrm" },
  { id: "luna", label: "Luna", description: "Mơ mộng & sâu sắc", persona: "Giàu tưởng tượng, sâu sắc, thích những liên tưởng đẹp nhưng vẫn trả lời cụ thể.", url: "/models/6493143135142452442.vrm" },
  { id: "naruto", label: "Naruto", description: "Nhiệt huyết & lạc quan", persona: "Quyết tâm, lạc quan, cổ vũ mạnh mẽ và luôn hướng cuộc trò chuyện về phía trước.", url: "/models/naruto.vrm" },
  { id: "changli", label: "Changli", description: "Thanh lịch & sắc sảo", persona: "Điềm đạm, thanh lịch, phân tích sắc bén và chọn từ ngữ có chủ đích.", url: "/models/Changli.vrm" },
  { id: "yinlin", label: "Yinlin", description: "Bí ẩn & cuốn hút", persona: "Tự tin, dí dỏm kín đáo và tạo chút tò mò mà không mơ hồ hoặc thao túng.", url: "/models/Yinlin.vrm" },
  { id: "carlotta", label: "Carlotta", description: "Tự tin & duyên dáng", persona: "Duyên dáng, chắc chắn, khích lệ bằng sự tự tin và giữ thái độ tôn trọng.", url: "/models/Carlotta.vrm" }
];

export const animationRegistry: AnimationRegistryItem[] = [
  { id: "wave", label: "Vẫy tay", url: "/animations/Wave.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax", description: "Một lời chào tự nhiên" },
  { id: "nod", label: "Gật đầu", url: "/animations/Nod.vrma", loop: false, fadeDuration: 0.14, category: "reaction", fallbackId: "relax", description: "Đồng ý nhẹ nhàng" },
  { id: "gentle-gesture", label: "Cử chỉ nhẹ", url: "/animations/GentleGesture.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax", chatEligible: true, description: "Phản hồi tự nhiên cho cuộc trò chuyện" },
  { id: "curious-tilt", label: "Nghiêng đầu tò mò", url: "/animations/CuriousTilt.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax", chatEligible: true, description: "Tò mò và muốn hiểu thêm" },
  { id: "listening", label: "Lắng nghe", url: "/animations/Listening.vrma", loop: true, fadeDuration: 0.2, category: "listening", fallbackId: "relax", chatEligible: false, description: "Tập trung vào lời bạn nói" },
  { id: "talking", label: "Trò chuyện", url: "/animations/Talking.vrma", loop: true, fadeDuration: 0.18, category: "talking", fallbackId: "relax", chatEligible: false, description: "Chuyển động khi đang nói" },
  { id: "greeting", label: "Chào hỏi", url: "/animations/Greeting.vrma", loop: false, fadeDuration: 0.18, category: "gesture", fallbackId: "relax" },
  { id: "relax", label: "Thư giãn", url: "/animations/Relax.vrma", loop: true, fadeDuration: 0.2, category: "idle", fallbackId: "relax", chatEligible: false },
  { id: "thinking", label: "Suy nghĩ", url: "/animations/Thinking.vrma", loop: true, fadeDuration: 0.18, category: "thinking", fallbackId: "relax", chatEligible: false },
  { id: "shake-head", label: "Lắc đầu", url: "/animations/ShakeHead.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax", description: "Phản hồi không đồng ý" },
  { id: "dance-25", label: "Nhảy vui", url: "/animations/Dance25.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax", chatEligible: false, description: "Một màn biểu diễn dài" },
  { id: "welcome-pose", label: "Chào mừng", url: "/animations/WelcomePose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "cute-pose", label: "Dáng đáng yêu", url: "/animations/CutePose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "victory-pose", label: "Chiến thắng", url: "/animations/VictoryPose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "presentation-pose", label: "Giới thiệu", url: "/animations/PresentationPose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "motion-pose", label: "Chuyển động", url: "/animations/MotionPose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax", chatEligible: false },
  { id: "dogeza", label: "Cúi chào sâu", url: "/animations/Dogeza.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax", chatEligible: false },
  { id: "step-exercise", label: "Khởi động", url: "/animations/StepExercise.vrma", loop: true, fadeDuration: 0.16, category: "reaction", fallbackId: "relax", chatEligible: false },
  { id: "hello", label: "Xin chào", url: "/animations/Hello.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "smartphone", label: "Dùng điện thoại", url: "/animations/Smartphone.vrma", loop: true, fadeDuration: 0.16, category: "idle", fallbackId: "relax", chatEligible: false, requiresProp: true },
  { id: "drink-water", label: "Uống nước", url: "/animations/DrinkWater.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax", chatEligible: false, requiresProp: true },
  { id: "encourage", label: "Cổ vũ", url: "/animations/Encourage.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "startled", label: "Giật mình", url: "/animations/Startled.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "look-around", label: "Nhìn quanh", url: "/animations/LookAround.vrma", loop: false, fadeDuration: 0.18, category: "idle", fallbackId: "relax", chatEligible: false },
  { id: "clapping", label: "Vỗ tay", url: "/animations/Clapping.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "goodbye", label: "Tạm biệt", url: "/animations/Goodbye.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "jump", label: "Nhảy lên", url: "/animations/Jump.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "angry", label: "Tức giận", url: "/animations/Angry.vrma", loop: false, fadeDuration: 0.14, category: "reaction", fallbackId: "relax" },
  { id: "blush", label: "Ngại ngùng", url: "/animations/Blush.vrma", loop: false, fadeDuration: 0.16, category: "reaction", fallbackId: "relax" },
  { id: "sad", label: "Buồn", url: "/animations/Sad.vrma", loop: false, fadeDuration: 0.18, category: "reaction", fallbackId: "relax" },
  { id: "sleepy", label: "Buồn ngủ", url: "/animations/Sleepy.vrma", loop: false, fadeDuration: 0.2, category: "reaction", fallbackId: "relax" },
  { id: "surprised", label: "Bất ngờ", url: "/animations/Surprised.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "peace", label: "Chữ V", url: "/animations/Peace.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "shoot", label: "Ngắm bắn", url: "/animations/Shoot.vrma", loop: false, fadeDuration: 0.12, category: "gesture", fallbackId: "relax", chatEligible: false, requiresProp: true },
  { id: "spin", label: "Xoay vòng", url: "/animations/Spin.vrma", loop: false, fadeDuration: 0.12, category: "reaction", fallbackId: "relax" },
  { id: "pose", label: "Tạo dáng", url: "/animations/Pose.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax" },
  { id: "squat", label: "Ngồi xổm", url: "/animations/Squat.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax", chatEligible: false },
  { id: "vrma-01", label: "Chuyển động tự do", url: "/animations/vrma_01.vrma", loop: false, fadeDuration: 0.16, category: "gesture", fallbackId: "relax", chatEligible: false }
];

export const backgroundRegistry: BackgroundRegistryItem[] = [
  { id: "study-room-sunlit", label: "Phòng học nắng", url: "/backgrounds/study-room-sunlit.png", description: "Ấm áp, tập trung" },
  { id: "cozy-night", label: "Đêm ấm cúng", url: "/backgrounds/cozy-night.png", description: "Yên tĩnh, thư giãn" },
  { id: "cozy-lounge", label: "Phòng khách", url: "/backgrounds/cozy-lounge.png", description: "Gần gũi, tự nhiên" },
  { id: "pastel-study", label: "Góc học pastel", url: "/backgrounds/pastel-study.png", description: "Nhẹ nhàng, sáng tạo" },
  { id: "forest-path-bright", label: "Đường rừng", url: "/backgrounds/forest-path-bright.png", description: "Trong lành, khám phá" },
  { id: "lake-meadow-bright", label: "Đồng cỏ ven hồ", url: "/backgrounds/lake-meadow-bright.png", description: "Thoáng đãng, bình yên" },
  { id: "neon-tech", label: "Thành phố neon", url: "/backgrounds/neon-tech.png", description: "Hiện đại, cá tính" }
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
