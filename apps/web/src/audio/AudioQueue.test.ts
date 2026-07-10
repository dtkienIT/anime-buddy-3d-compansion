import { describe, expect, it } from "vitest";
import { AudioQueue } from "./AudioQueue.js";

describe("AudioQueue", () => {
  it("cancels the previous task when replaced", async () => {
    const queue = new AudioQueue();
    let aborted = false;
    const first = queue.run(async (signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await queue.run(async () => undefined);
    await first;
    expect(aborted).toBe(true);
  });
});
