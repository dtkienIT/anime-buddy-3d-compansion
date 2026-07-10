import type { CompanionState } from "./types.js";

const allowedTransitions: Record<CompanionState, CompanionState[]> = {
  BOOTING: ["IDLE", "ERROR", "DISPOSED"],
  IDLE: ["LISTENING", "THINKING", "SPEAKING", "ERROR", "DISPOSED"],
  LISTENING: ["THINKING", "IDLE", "ERROR", "DISPOSED"],
  THINKING: ["SPEAKING", "REACTING", "IDLE", "ERROR", "DISPOSED"],
  SPEAKING: ["REACTING", "IDLE", "ERROR", "DISPOSED"],
  REACTING: ["IDLE", "ERROR", "DISPOSED"],
  ERROR: ["IDLE", "DISPOSED"],
  DISPOSED: []
};

export class ChatStateMachine extends EventTarget {
  private currentState: CompanionState = "BOOTING";

  get state(): CompanionState {
    return this.currentState;
  }

  canTransition(nextState: CompanionState): boolean {
    return allowedTransitions[this.currentState].includes(nextState);
  }

  transition(nextState: CompanionState): void {
    if (this.currentState === nextState) {
      return;
    }

    if (!this.canTransition(nextState)) {
      throw new Error(`Invalid companion state transition ${this.currentState} -> ${nextState}`);
    }

    this.currentState = nextState;
    this.dispatchEvent(new CustomEvent("statechange", { detail: nextState }));
  }
}
