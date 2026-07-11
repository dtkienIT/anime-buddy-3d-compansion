import type { CompanionState } from "../chat/types.js";

const stateLabels: Record<CompanionState, string> = {
  BOOTING: "Đang khởi động...",
  IDLE: "Sẵn sàng",
  LISTENING: "Đang nghe",
  THINKING: "Đang suy nghĩ...",
  SPEAKING: "Đang nói...",
  REACTING: "Đang phản ứng",
  ERROR: "Không thể kết nối",
  DISPOSED: "Đã dừng"
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
