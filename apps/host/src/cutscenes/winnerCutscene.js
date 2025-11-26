// winnerCutscene.js
import { endCutscene } from "./cutsceneCamera.js";

export async function playWinnerCutscene(winnerName, onFinish = () => {}) {
  console.log("🎉 Playing WINNER cutscene");

  // Fade to black overlay
  const fade = document.createElement("div");
  fade.style.position = "fixed";
  fade.style.inset = "0";
  fade.style.background = "black";
  fade.style.opacity = 0;
  fade.style.transition = "opacity 0.8s";
  fade.style.zIndex = 9999;
  document.body.appendChild(fade);

  await new Promise((r) => requestAnimationFrame(r));
  fade.style.opacity = 1;

  // Winner text
  const text = document.createElement("div");
  text.style.position = "fixed";
  text.style.top = "30%";
  text.style.width = "100%";
  text.style.textAlign = "center";
  text.style.fontSize = "3rem";
  text.style.color = "white";
  text.style.fontFamily = "system-ui";
  text.innerText = `WINNER: ${winnerName}`;
  text.style.zIndex = 10000;
  document.body.appendChild(text);

  // Confetti (simple emoji)
  const confetti = document.createElement("div");
  confetti.style.position = "fixed";
  confetti.style.top = "0";
  confetti.style.width = "100%";
  confetti.style.height = "100%";
  confetti.style.zIndex = 10001;
  confetti.style.pointerEvents = "none";
  confetti.innerText = "🎉🎊🎉🎊🎉";
  confetti.style.fontSize = "5rem";
  confetti.style.animation = "drop 2s infinite linear";
  document.body.appendChild(confetti);

  // End after 3 seconds
  await new Promise((r) => setTimeout(r, 2500));

  fade.remove();
  text.remove();
  confetti.remove();

  endCutscene();
  onFinish();
}
