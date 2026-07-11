import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "apps/web/public/models/8590256991748008892.vrm",
  "apps/web/public/models/8329890252317737768.vrm",
  "apps/web/public/models/sample.vrm",
  "apps/web/public/models/vita.vrm",
  "apps/web/public/models/vivi.vrm",
  "apps/web/public/models/6493143135142452442.vrm",
  "apps/web/public/models/naruto.vrm",
  "apps/web/public/models/Changli.vrm",
  "apps/web/public/models/Yinlin.vrm",
  "apps/web/public/models/Carlotta.vrm",
  "apps/web/public/animations/Relax.vrma",
  "apps/web/public/animations/Thinking.vrma",
  "apps/web/public/animations/ShakeHead.vrma",
  "apps/web/public/animations/Dance25.vrma",
  "apps/web/public/animations/WelcomePose.vrma",
  "apps/web/public/animations/CutePose.vrma",
  "apps/web/public/animations/VictoryPose.vrma",
  "apps/web/public/animations/PresentationPose.vrma",
  "apps/web/public/animations/MotionPose.vrma",
  "apps/web/public/animations/Dogeza.vrma",
  "apps/web/public/animations/StepExercise.vrma",
  "apps/web/public/animations/Hello.vrma",
  "apps/web/public/animations/Smartphone.vrma",
  "apps/web/public/animations/DrinkWater.vrma",
  "apps/web/public/animations/Encourage.vrma",
  "apps/web/public/animations/Startled.vrma",
  "apps/web/public/animations/vrma_01.vrma",
  "apps/web/public/backgrounds/study-room-sunlit.png"
];

const missing = required.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
if (missing.length > 0) {
  console.error(`Missing assets:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log(`Asset check passed for ${required.length} required files.`);
