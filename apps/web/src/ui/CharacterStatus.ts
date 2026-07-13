import type { CompanionState } from "../chat/types.js";

const stateLabels: Record<CompanionState, string> = {
  BOOTING: "Đang mở",
  IDLE: "Sẵn sàng",
  LISTENING: "Đang nghe",
  THINKING: "Đang nghĩ",
  SPEAKING: "Đang nói",
  REACTING: "Đang phản hồi",
  ERROR: "Mất kết nối",
  DISPOSED: "Đã dừng"
};

export class CharacterStatus {
  constructor(
    private readonly label: HTMLElement,
    private readonly pill: HTMLElement
  ) {}

  set(state: CompanionState, detail?: string): void {
    this.label.textContent = detail || stateLabels[state];
    this.pill.textContent = stateLabels[state];
    this.pill.dataset.state = state;
  }
}
