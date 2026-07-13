import "./styles/base.css";
import "./styles/chat.css";
import "./styles/responsive.css";
import { bootstrap } from "./app/bootstrap.js";

bootstrap().catch((error) => {
  console.error(error);
  document.body.classList.add("is-error");
  const note = document.querySelector<HTMLElement>("#loader-note");
  const retry = document.querySelector<HTMLButtonElement>("#loader-retry");
  const status = document.querySelector<HTMLElement>("#character-status");
  const chatStatus = document.querySelector<HTMLElement>("#chat-status");
  const pill = document.querySelector<HTMLElement>("#state-pill");
  if (note) note.textContent = "Không thể mở nhân vật 3D. Hãy kiểm tra kết nối rồi thử lại.";
  if (retry) retry.hidden = false;
  if (status) status.textContent = "Không thể khởi động";
  if (chatStatus) chatStatus.textContent = "Không thể khởi động";
  if (pill) {
    pill.dataset.state = "ERROR";
    pill.textContent = "Cần thử lại";
  }
});
