// introCutscene.js
import * as THREE from "three";
import { moveCameraTo, stopCutscene } from "./cutsceneCamera.js";

/**
 * We now accept roundCount as a parameter.
 * This allows us to customize the judge's dialogue.
 */
export async function playIntroCutscene(roundCount = 5, onFinish = () => {}) {
  console.log("🎯 Cutscene received roundCount =", roundCount);
  console.log("🎥 Playing INTRO cutscene");

  const cam = window.__majorityCamera;  // set in scene.js
  if (!cam) return onFinish();

  // 1. Camera starts at back of room
  cam.position.set(0, 3, -14);
  cam.lookAt(0, 4, 11);

  // 2. Move camera forward toward judge
  await moveCameraTo(
    new THREE.Vector3(0, 3.5, 6.5),      // new cam position
    new THREE.Vector3(0, 3.8, 11.4),     // look at judge
    2.2
  );

  // --- UPDATED DYNAMIC DIALOGUE ---
  const judgeLines = [
    "Attention robots...",
    "You five stand on trial under suspicion of being HUMAN.",
    `You will answer ${roundCount} questions.`, 
    "Each round, you must answer along with the MINORITY to receive a point.",
    "If you are in the minority you will receive a point.",
    "The one with the most points once the game is over will be declared a true robot.",
    "Only the true robot that wins this game will be set free.",
    "Good luck. Your trial begins now..."
  ];

  // 3. Dialogue subtitles overlay
  const box = document.createElement("div");
  box.style.position = "fixed";
  box.style.bottom = "6%";
  box.style.width = "100%";
  box.style.textAlign = "center";
  box.style.fontSize = "2.2rem";
  box.style.color = "white";
  box.style.textShadow = "0 0 10px black";
  box.style.fontFamily = "system-ui";
  box.style.zIndex = 9999;
  document.body.appendChild(box);

  for (const line of judgeLines) {
    box.innerText = line;
    await new Promise((r) => setTimeout(r, 4500));
  }

  // Remove overlay
  box.remove();

  stopCutscene();
  onFinish();
}
