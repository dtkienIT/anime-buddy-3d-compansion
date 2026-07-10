import { AppController } from "./AppController.js";

export async function bootstrap(): Promise<void> {
  const app = new AppController();
  await app.init();
}
