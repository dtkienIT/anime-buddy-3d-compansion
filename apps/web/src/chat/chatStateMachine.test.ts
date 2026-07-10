import { describe, expect, it } from "vitest";
import { ChatStateMachine } from "./chatStateMachine.js";

describe("ChatStateMachine", () => {
  it("follows the main conversation flow", () => {
    const machine = new ChatStateMachine();
    machine.transition("IDLE");
    machine.transition("THINKING");
    machine.transition("SPEAKING");
    machine.transition("REACTING");
    machine.transition("IDLE");
    expect(machine.state).toBe("IDLE");
  });

  it("rejects invalid transitions", () => {
    const machine = new ChatStateMachine();
    expect(() => machine.transition("SPEAKING")).toThrow();
  });
});
