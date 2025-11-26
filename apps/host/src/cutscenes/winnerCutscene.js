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
  plane.position.set(0, 6, -5);
  scene.add(plane);
  return plane;
}

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
    p.position.set((Math.random() * 14) - 7, 10 + Math.random() * 4, 0);

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

  function tick() {
    pieces.forEach((p) => {
      p.position.add(p.userData.vel);
      p.rotation.x += 0.03;
      p.rotation.y += 0.02;
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
   WINNER AVATAR DANCE
-------------------------------------------------- */

function applyDance(group) {
  let t = 0;
  const step = () => {
    t += 0.04;
    group.position.y = 1.6 + Math.sin(t * 3) * 0.1;
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
  if (!Array.isArray(winnerNames)) winnerNames = [winnerNames];

  console.log("🏆 PLAYING WINNER CUTSCENE — WINNERS:", winnerNames);

  const scene = window.__majorityScene;
  const camera = window.__majorityCamera;

  if (!scene || !camera) {
    console.warn("⚠️ Missing scene or camera");
    return onFinish();
  }

  /* ---------- LOCK GAME CAMERA ---------- */
  startCutscene();

  /* ---------- FULLSCREEN CANVAS FIX ---------- */
  const canvas = document.querySelector("canvas");
  let prevCanvasHeight = null;
  let prevCanvasPosition = null;
  let prevBodyBg = document.body.style.background;

  if (canvas) {
    prevCanvasHeight = canvas.style.height;
    prevCanvasPosition = canvas.style.position;

    canvas.style.height = "100vh";
    canvas.style.width = "100vw";
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "1";
  }

  document.body.style.background = "black";
  document.body.style.overflow = "hidden";

  /* ---------- FADE OVERLAY ---------- */
  let fade = document.getElementById("cutscene-fade");
  if (!fade) {
    fade = document.createElement("div");
    fade.id = "cutscene-fade";
    fade.style.position = "fixed";
    fade.style.inset = "0";
    fade.style.background = "black";
    fade.style.opacity = "0";
    fade.style.transition = "opacity .8s ease";
    fade.style.pointerEvents = "none";
    fade.style.zIndex = "99999";
    document.body.appendChild(fade);
  }

  fade.style.opacity = "1";
  await wait(700);

  hideCourtroom(scene);

  /* ---------- BACKGROUND ---------- */
  const bg = createBlackBG(scene);

  /* ---------- LIGHTING (BRIGHT & CLEAN) ---------- */
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 8, 6);
  const fill = new THREE.DirectionalLight(0xffffff, 1.3);
  fill.position.set(-4, 6, 5);
  scene.add(ambient, key, fill);

  /* ---------- GLOW FLOOR ---------- */
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: 0x444444,
      emissiveIntensity: 0.6,
      roughness: 0.8,
      metalness: 0.2
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 1.5, 0);
  scene.add(floor);

  /* ---------- WINNER TITLE ---------- */
  let title = document.getElementById("winner-title");
  if (!title) {
    title = document.createElement("div");
    title.id = "winner-title";
    title.style.position = "fixed";
    title.style.top = "6%";
    title.style.width = "100%";
    title.style.textAlign = "center";
    title.style.fontSize = "4.2rem";
    title.style.fontWeight = "900";
    title.style.color = "white";
    title.style.textShadow = "0 0 25px white, 0 0 65px white";
    title.style.fontFamily = "system-ui";
    title.style.zIndex = "999999";
    document.body.appendChild(title);
  }

  title.innerText =
    winnerNames.length === 1
      ? `★ ${winnerNames[0]} WINS! ★`
      : `★ TIE: ${winnerNames.join(" • ")} ★`;

  /* ---------- SUBTITLE ---------- */
  let sub = document.getElementById("winner-subtext");
  if (!sub) {
    sub = document.createElement("div");
    sub.id = "winner-subtext";
    sub.style.position = "fixed";
    sub.style.top = "15%";
    sub.style.width = "100%";
    sub.style.textAlign = "center";
    sub.style.fontSize = "2.4rem";
    sub.style.color = "#eeeeee";
    sub.style.fontWeight = "700";
    sub.style.textShadow = "0 0 12px #000, 0 0 24px #000";
    sub.style.zIndex = "999999";
    sub.style.fontFamily = "system-ui";
    document.body.appendChild(sub);
  }

  sub.innerText =
    winnerNames.length === 1
      ? "I AM THE WINNER"
      : "WE ARE THE WINNERS";

  /* ---------- WINNERS ---------- */
  const groups = [];
  const spacing = 3.2;
  const totalWidth = (winnerNames.length - 1) * spacing;

  winnerNames.forEach((name, i) => {
    const avatar = createAvatar(name);

    // make avatars brighter
    avatar.traverse((child) => {
      if (child.isMesh) {
        child.material.emissive = new THREE.Color(0x111111);
        child.material.emissiveIntensity = 0.5;
      }
    });

    avatar.position.set(i * spacing - totalWidth / 2, 1.6, 0);
    avatar.rotation.y = Math.PI;

    scene.add(avatar);
    groups.push(avatar);

    applyDance(avatar);
  });

  /* ---------- CONFETTI ---------- */
  const confetti = spawnConfetti(scene);

  fade.style.opacity = "0";
  await wait(1000);

  /* ---------- CAMERA ---------- */
  await moveCameraTo(
    new THREE.Vector3(0, 4.8, 10),
    new THREE.Vector3(0, 2, 0),
    2
  );

  await wait(15000);

  /* ---------- FADE OUT ---------- */
  fade.style.opacity = "1";
  await wait(900);

  /* ---------- CLEANUP ---------- */
  groups.forEach((g) => {
    stopDance(g);
    scene.remove(g);
  });
  confetti.forEach((p) => scene.remove(p));

  scene.remove(bg, ambient, key, fill, floor);

  document.getElementById("winner-title")?.remove();
  document.getElementById("winner-subtext")?.remove();

  showCourtroom(scene);

  fade.style.opacity = "0";

  /* ---------- RESTORE CANVAS ---------- */
  if (canvas) {
    canvas.style.position = prevCanvasPosition || "";
    canvas.style.height = prevCanvasHeight || "";
    canvas.style.width = "";
    canvas.style.top = "";
    canvas.style.left = "";
    canvas.style.zIndex = "";
  }

  document.body.style.background = prevBodyBg;
  document.body.style.overflow = "";

  /* ---------- UNLOCK CAMERA ---------- */
  stopCutscene();
  onFinish();
}
