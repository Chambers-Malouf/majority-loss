// apps/host/src/cutscenes/winnerCutscene.js
console.log("🏆 winnerCutscene.js loaded");

import * as THREE from "three";
import { moveCameraTo, startCutscene, stopCutscene } from "./cutsceneCamera.js";
import { createAvatar } from "../scene/avatar.js";

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/* --------------------------------------------------
   BLACK BACKGROUND "STAGE"
-------------------------------------------------- */

function createBlackBG(scene) {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  // Behind the winners (who will be at z = 0)
  plane.position.set(0, 6, -5);
  scene.add(plane);
  return plane;
}

/**
 * Hide the existing courtroom objects, but DO NOT
 * hide the root scene itself (that caused the white screen).
 */
function hideCourtroom(scene) {
  scene.children.forEach((obj) => {
    if (!obj.userData) obj.userData = {};
    obj.userData._savedVisible = obj.visible;
    obj.visible = false;
  });
}

function showCourtroom(scene) {
  scene.children.forEach((obj) => {
    if (obj.userData && obj.userData._savedVisible !== undefined) {
      obj.visible = obj.userData._savedVisible;
    }
  });
}

/* --------------------------------------------------
   CONFETTI
-------------------------------------------------- */

function spawnConfetti(scene) {
  const pieces = [];
  const geom = new THREE.PlaneGeometry(0.25, 0.35);
  const colors = [0xff4f4f, 0x4fa3ff, 0xffe066, 0x7fff7f, 0xbc6ff1];

  for (let i = 0; i < 250; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      side: THREE.DoubleSide,
    });

    const p = new THREE.Mesh(geom, mat);
    p.position.set(
      (Math.random() * 14) - 7,      // spread left/right
      10 + Math.random() * 4,        // drop from above
      0                              // same depth as winners
    );
    p.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    p.userData.vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.03,
      -0.04 - Math.random() * 0.02,
      (Math.random() - 0.5) * 0.02
    );

    scene.add(p);
    pieces.push(p);
  }

  // Simple perpetual animation
  function tick() {
    pieces.forEach((p) => {
      p.position.add(p.userData.vel);
      p.rotation.x += 0.03;
      p.rotation.y += 0.02;

      // Loop back to the top once it falls off-screen
      if (p.position.y < -2) {
        p.position.y = 9 + Math.random() * 3;
      }
    });
    requestAnimationFrame(tick);
  }
  tick();

  return pieces;
}

/* --------------------------------------------------
   WINNER "DANCE" (bounce + sway)
-------------------------------------------------- */

function applyDance(group) {
  let t = 0;
  const step = () => {
    t += 0.04;
    // Gentle bounce
    group.position.y = 1.6 + Math.sin(t * 3) * 0.1;
    // Sway left/right
    group.rotation.y = Math.sin(t) * 0.4;
    group.userData._danceFrame = requestAnimationFrame(step);
  };
  step();
}

function stopDance(group) {
  if (group?.userData?._danceFrame) {
    cancelAnimationFrame(group.userData._danceFrame);
    delete group.userData._danceFrame;
  }
}

/* --------------------------------------------------
   MAIN CUTSCENE
-------------------------------------------------- */

export async function playWinnerCutscene(winnerNames, onFinish = () => {}) {
  // Normalize to array to handle single or multiple winners
  if (!Array.isArray(winnerNames)) {
    winnerNames = [winnerNames];
  }

  console.log("🏆 PLAYING WINNER CUTSCENE — WINNERS:", winnerNames);

  const scene = window.__majorityScene;
  const camera = window.__majorityCamera;

  if (!scene || !camera) {
    console.warn("⚠️ Missing scene or camera for winner cutscene");
    return onFinish();
  }

  // Lock gameplay camera-follow
  startCutscene();

  // ---------- FADE OVERLAY ----------
  let fade = document.getElementById("cutscene-fade");
  if (!fade) {
    fade = document.createElement("div");
    fade.id = "cutscene-fade";
    fade.style.position = "fixed";
    fade.style.inset = "0";
    fade.style.background = "black";
    fade.style.opacity = "0";
    fade.style.transition = "opacity 1s ease";
    fade.style.pointerEvents = "none";
    fade.style.zIndex = "99999";
    document.body.appendChild(fade);
  }

  // Fade to black
  fade.style.opacity = "1";
  await wait(700);

  // ---------- HIDE COURTROOM ----------
  hideCourtroom(scene); // only children, not the root scene

  // ---------- BLACK BACKGROUND / STAGE ----------
  const bg = createBlackBG(scene);

  // ---------- CREATE WINNER AVATARS ----------
  const winnerGroups = [];
  const count = winnerNames.length;
  const spacing = 3.2; // horizontal spacing between winners
  const totalWidth = (count - 1) * spacing;

  winnerNames.forEach((name, index) => {
    const avatar = createAvatar(name);
    avatar.scale.set(1, 1, 1);

    // Spread winners evenly around center on X axis
    const x = index * spacing - totalWidth / 2;
    avatar.position.set(x, 1.6, 0);
    avatar.rotation.y = Math.PI; // facing camera

    scene.add(avatar);
    winnerGroups.push(avatar);

    applyDance(avatar);
  });

  // ---------- CONFETTI ----------
  const confetti = spawnConfetti(scene);

  // Fade back in to reveal winners
  fade.style.opacity = "0";
  await wait(1000);

  // ---------- CAMERA SETUP ----------
  // One simple wide shot (no snapping between angles)
  const widest = winnerNames.length;
  const camDist = 9 + widest * 1.5; // push back a bit for more winners
  const camHeight = 4.8;

  await moveCameraTo(
    new THREE.Vector3(0, camHeight, camDist),
    new THREE.Vector3(0, 2.0, 0),
    2.0
  );

  // ---------- HOLD FOR A FEW SECONDS ----------
  await wait(5000);

  // ---------- FADE OUT ----------
  fade.style.opacity = "1";
  await wait(1000);

  // ---------- CLEANUP ----------
  winnerGroups.forEach((g) => {
    stopDance(g);
    scene.remove(g);
  });
  confetti.forEach((p) => scene.remove(p));
  scene.remove(bg);

  // Restore courtroom visibility
  showCourtroom(scene);

  // Fade UI overlay back out
  fade.style.opacity = "0";
  await wait(400);

  // Unlock camera-follow
  stopCutscene();

  console.log("🏁 Winner cutscene complete.");
  onFinish();
}
