import "./styles/base.css";
import "./styles/chat.css";
import "./styles/responsive.css";
import { bootstrap } from "./app/bootstrap.js";

bootstrap().catch((error) => {
  console.error(error);
  document.body.classList.add("is-error");
});
