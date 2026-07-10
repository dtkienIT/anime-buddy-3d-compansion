export class ToastManager {
  constructor(private readonly root: HTMLElement) {}

  show(message: string, timeoutMs = 4200): void {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    this.root.append(toast);

    window.setTimeout(() => {
      toast.remove();
    }, timeoutMs);
  }
}
