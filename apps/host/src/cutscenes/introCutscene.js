// introCutscene.js
import * as THREE from "three";
import { moveCameraTo, endCutscene } from "./cutsceneCamera.js";

const judgeLines = [
  "Attention robots...",
  "You five stand on trial under suspicion of being HUMAN.",
  "You will answer 10 questions.",
  "Each round, you must match the MAJORITY answer to survive.",
  "The one with the highest score will be declared a true robot.",
  "Good luck. Your trial begins now..."
];

export async function playIntroCutscene(onFinish = () => {}) {
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
    await new Promise((r) => setTimeout(r, 1600));
  }

  // Remove overlay
  box.remove();

  endCutscene();
  onFinish();
}
