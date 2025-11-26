// apps/host/src/scene/mainMenuScene.js
console.log("🔥 mainMenuScene.js LOADED (live)");

import * as THREE from "three";
import { createAvatar } from "./avatar.js";

// 👇 we NO LONGER import playIntroCutscene or initScene here
// import { playIntroCutscene } from "../cutscenes/introCutscene.js";
// import { initScene } from "./scene.js";

let scene, camera, renderer;
let clock;
let animationId = null;
let containerEl = null;
let soloStarting = false;

// Robots walking / hovering in hallway
const robots = [];

// Posters (SOLO, TITLE, MULTIPLAYER)
const posters = [];
let hoveredPoster = null;

// Raycasting for clicking posters
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Callbacks into table.js
let onMultiplayerClickCb = null;
let onSoloClickCb = null;

// ---------------------- POSTER HELPERS ----------------------

function makePosterTexture({ title, subtitle, bgColor, accentColor }) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, accentColor);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height * 0.6);
  ctx.lineTo(canvas.width * 0.7, 0);
  ctx.lineTo(canvas.width, 0);
  ctx.lineTo(canvas.width, canvas.height * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ffffff";
  ctx.font =
    "bold 68px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 12;
  ctx.fillText(title, canvas.width / 2, canvas.height * 0.45);

  if (subtitle) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe9b3";
    ctx.font =
      "24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(subtitle, canvas.width / 2, canvas.height * 0.7);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createPoster(opts) {
  const geometry = new THREE.PlaneGeometry(4.5, 2.4);
  const texture = makePosterTexture(opts);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0x111111,
    emissiveIntensity: 0.9,
    roughness: 0.4,
    metalness: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.type = opts.type;
  mesh.userData.isPoster = true;
  mesh.userData.action =
    opts.type === "multiplayer"
      ? "multiplayer"
      : opts.type === "solo"
      ? "solo"
      : null;
  posters.push(mesh);
  return mesh;
}

// ---------------------- ROBOT HELPERS -----------------------

function spawnRobot({ x, z, hover }) {
  const bot = createAvatar("BOT");
  bot.position.set(x, 1.6, z);
  bot.userData.baseY = bot.position.y;
  bot.userData.phase = Math.random() * Math.PI * 2;

  bot.userData.direction = Math.random() < 0.5 ? -1 : 1;
  bot.userData.speed = 1.2 + Math.random() * 0.8;
  bot.userData.minX = -16;
  bot.userData.maxX = 16;
  bot.userData.hover = hover;
  bot.userData.stopTimer = 0;

  scene.add(bot);
  robots.push(bot);
}

function createSparks() {
  const sparkCount = 40;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(sparkCount * 3);

  for (let i = 0; i < sparkCount; i++) {
    const x = -16 + Math.random() * 32;
    const y = 5 + Math.random() * 1.5;
    const z = -2 + Math.random() * 4;
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.07,
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.85,
  });

  const points = new THREE.Points(geom, mat);
  points.userData.sparkCount = sparkCount;
  scene.add(points);
  return points;
}

// ---------------------- INIT SCENE -------------------------

export function initMainMenuScene(
  containerId = "table-app",
  { onMultiplayerClick, onSoloClick } = {}
) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) throw new Error(`Missing container #${containerId}`);

  onMultiplayerClickCb =
    typeof onMultiplayerClick === "function" ? onMultiplayerClick : null;
  onSoloClickCb = typeof onSoloClick === "function" ? onSoloClick : null;

  while (containerEl.firstChild) {
    containerEl.removeChild(containerEl.firstChild);
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);

  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  console.log("Renderer created:", renderer.domElement);

  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.width = "100vw";
  renderer.domElement.style.height = "100vh";
  renderer.domElement.style.pointerEvents = "auto";
  renderer.domElement.style.touchAction = "none";

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  containerEl.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 4, 12);
  camera.lookAt(0, 3, -4);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(6, 7, 8);
  scene.add(key);

  const magentaFill = new THREE.PointLight(0xf97316, 1.3, 40);
  magentaFill.position.set(-10, 4, -1);
  scene.add(magentaFill);

  const tealFill = new THREE.PointLight(0x22c55e, 1.2, 40);
  tealFill.position.set(10, 4, -1);
  scene.add(tealFill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 12),
    new THREE.MeshStandardMaterial({
      color: 0x050816,
      roughness: 0.7,
      metalness: 0.3,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 12),
    new THREE.MeshStandardMaterial({
      color: 0x0b1020,
      roughness: 0.3,
      metalness: 0.4,
      emissive: 0x111827,
      emissiveIntensity: 0.5,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 7, -2);
  scene.add(ceiling);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 10),
    new THREE.MeshStandardMaterial({
      color: 0x020617,
      roughness: 0.9,
      metalness: 0.1,
    })
  );
  backWall.position.set(0, 3.5, -6);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 10),
    new THREE.MeshStandardMaterial({
      color: 0x020617,
      roughness: 0.9,
      metalness: 0.1,
    })
  );
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-20, 3.5, -2);
  scene.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(20, 3.5, -2);
  scene.add(rightWall);

  const posterGlow = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.1, 0.3),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
    })
  );
  posterGlow.position.set(0, 6.4, -5.8);
  scene.add(posterGlow);

  const soloPoster = createPoster({
    type: "solo",
    title: "SOLO",
    subtitle: "vs AI",
    bgColor: "#1d4ed8",
    accentColor: "#22c55e",
  });
  soloPoster.position.set(-7, 3.3, -5.9);
  scene.add(soloPoster);

  const titlePoster = createPoster({
    type: "title",
    title: "MAJORITY LOSS",
    subtitle: "by Chambers Malouf",
    bgColor: "#facc15",
    accentColor: "#ef4444",
  });
  titlePoster.position.set(0, 3.3, -5.9);
  scene.add(titlePoster);

  const multiPoster = createPoster({
    type: "multiplayer",
    title: "MULTIPLAYER",
    subtitle: "Online",
    bgColor: "#b91c1c",
    accentColor: "#f97316",
  });
  multiPoster.position.set(7, 3.3, -5.9);
  scene.add(multiPoster);

  posters.forEach((p) => {
    p.rotation.x = -0.05;
  });

  spawnRobot({ x: 0, z: -3, hover: true });
  spawnRobot({ x: -10, z: -1.5, hover: false });
  spawnRobot({ x: -5, z: -2.5, hover: false });
  spawnRobot({ x: 5, z: -1.3, hover: true });
  spawnRobot({ x: 11, z: -2.2, hover: false });

  const sparks = createSparks();
  sparks.userData.isSparks = true;

  window.addEventListener("resize", onWindowResize);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("click", onClickPoster);

  animate();
}

// ---------------------- TEARDOWN ----------------------------

export function disposeMainMenuScene() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  window.removeEventListener("resize", onWindowResize);
  if (renderer && renderer.domElement) {
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("click", onClickPoster);
  }

  if (containerEl && renderer && renderer.domElement.parentElement === containerEl) {
    containerEl.removeChild(renderer.domElement);
  }

  scene = null;
  camera = null;
  renderer = null;
  hoveredPoster = null;
  posters.length = 0;
  robots.length = 0;
  soloStarting = false;
}

// ---------------------- EVENTS / INTERACTION ---------------

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerMove(event) {
  if (!renderer || !camera || !scene) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(posters, false);

  let newHover = null;
  if (intersects.length > 0) {
    newHover = intersects[0].object;
  }

  if (hoveredPoster !== newHover) {
    if (hoveredPoster) {
      hoveredPoster.scale.set(1, 1, 1);
      hoveredPoster.material.emissiveIntensity = 0.9;
    }
    hoveredPoster = newHover;
    if (hoveredPoster) {
      hoveredPoster.scale.set(1.08, 1.08, 1.08);
      hoveredPoster.material.emissiveIntensity = 1.5;
    }
  }
}

function onClickPoster(event) {
  if (!renderer || !camera) return;

  console.log("🖱 CLICK on menu canvas");

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(posters, false);

  if (!intersects.length) {
    console.log("❌ Clicked, but no poster hit");
    return;
  }

  const obj = intersects[0].object;
  const action = obj.userData.action;
  console.log("✅ Poster clicked:", action, obj.userData);

  // MULTIPLAYER
  if (action === "multiplayer" && onMultiplayerClickCb) {
    onMultiplayerClickCb();
    return;
  }

  // SOLO — just leave hallway & let solo.js handle cutscenes
  if (action === "solo" && onSoloClickCb) {
    if (soloStarting) return;
    soloStarting = true;

    console.log("🎬 SOLO POSTER CLICKED — handing off to solo.js");

    renderer.domElement.removeEventListener("click", onClickPoster);
    disposeMainMenuScene();

    onSoloClickCb();
  }
}

// ---------------------- ANIMATION LOOP ---------------------

function animate() {
  animationId = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera || !clock) return;

  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  for (const bot of robots) {
    const data = bot.userData;
    if (!data) continue;

    if (data.stopTimer > 0) {
      data.stopTimer -= dt;
      bot.rotation.y = Math.sin(t * 1.2 + data.phase) * 0.3;
    } else {
      bot.position.x += data.direction * data.speed * dt;
      if (bot.position.x < data.minX) {
        bot.position.x = data.minX;
        data.direction *= -1;
      } else if (bot.position.x > data.maxX) {
        bot.position.x = data.maxX;
        data.direction *= -1;
      }

      if (Math.random() < 0.0015) {
        data.stopTimer = 1.5 + Math.random() * 1.5;
      }

      bot.rotation.y = data.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    }

    if (data.hover) {
      const bob = Math.sin(t * 2 + data.phase) * 0.15;
      bot.position.y = bot.userData.baseY + bob;
    } else {
      const step = Math.abs(Math.sin(t * 6 + data.phase)) * 0.08;
      bot.position.y = bot.userData.baseY + step;
    }
  }

  camera.lookAt(0, 3, -4);
  renderer.render(scene, camera);
}
