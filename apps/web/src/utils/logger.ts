export const logger = {
  info(message: string, extra?: unknown): void {
    console.info(`[companion] ${message}`, extra ?? "");
  },
  warn(message: string, extra?: unknown): void {
    console.warn(`[companion] ${message}`, extra ?? "");
  },
  error(message: string, extra?: unknown): void {
    console.error(`[companion] ${message}`, extra ?? "");
  }
};
