import type { CompanionState } from "../chat/types.js";

const stateLabels: Record<CompanionState, string> = {
  BOOTING: "Dang khoi dong...",
  IDLE: "San sang",
  LISTENING: "Dang nghe",
  THINKING: "Dang suy nghi...",
  SPEAKING: "Dang noi...",
  REACTING: "Dang phan ung",
  ERROR: "Khong the ket noi",
  DISPOSED: "Da dung"
};

export class CharacterStatus {
  constructor(
    private readonly label: HTMLElement,
    private readonly pill: HTMLElement
  ) {}

  set(state: CompanionState, detail?: string): void {
    this.label.textContent = detail || stateLabels[state];
    this.pill.textContent = state;
  }
}
