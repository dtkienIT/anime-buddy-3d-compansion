export type ToastVariant = "info" | "success" | "warning" | "error";

export class ToastManager {
  private readonly active = new Map<string, HTMLElement>();

  constructor(private readonly root: HTMLElement) {}

  show(message: string, timeoutMs = 4200, variant: ToastVariant = "info"): void {
    const normalized = message.trim();
    if (!normalized) return;

    const existing = this.active.get(normalized);
    if (existing) {
      if (!prefersReducedMotion()) {
        existing.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }], { duration: 220 });
      }
      return;
    }

    const toast = document.createElement("div");
    toast.className = `toast is-${variant}`;
    toast.setAttribute("role", variant === "error" ? "alert" : "status");

    const text = document.createElement("span");
    text.textContent = normalized;
    toast.append(text);
    this.root.append(toast);
    this.active.set(normalized, toast);

    const dismiss = (): void => {
      if (!toast.isConnected) return;
      this.active.delete(normalized);
      if (prefersReducedMotion()) {
        toast.remove();
        return;
      }
      toast.animate?.([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(6px)" }], { duration: 150 })
        .finished.catch(() => undefined)
        .finally(() => toast.remove());
    };

    toast.addEventListener("click", dismiss, { once: true });
    window.setTimeout(dismiss, timeoutMs);
  }
}

function prefersReducedMotion(): boolean {
  return document.body.classList.contains("is-reduced-motion")
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
