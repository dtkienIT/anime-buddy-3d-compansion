import { AppController } from "./AppController.js";

export async function bootstrap(): Promise<void> {
  const app = new AppController();
  await app.init();
  window.addEventListener("pagehide", (event) => {
    if (!(event as Event & { persisted?: boolean }).persisted) app.dispose();
  }, { once: true });
}
