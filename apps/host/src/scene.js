// ===================================================
// ================ IMPORTS & SETUP ==================
// ===================================================
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer, controls;
let tabletMesh, tabletTexture, ctx;
let seats = [];
let nameplates = [];
let jumbotron, jumbotronTexture, jumboCtx;

// ===================================================
// =============== CANVAS TEXTURE DRAWING ============
// ===================================================
function drawTablet({
  title = "MAJORITY LOSS — SOLO",
  question = "",
  options = [],
  timer = 0,
  aiLines = [],
  results = null,
}) {
  if (!ctx) return;

  const w = 1024, h = 768;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#f7d046";
  ctx.font = "bold 42px ui-monospace";
  ctx.fillText(title, 36, 70);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Inter, system-ui, sans-serif";
  wrapText(question, 36, 140, 950, 42);

  ctx.font = "600 30px Inter, system-ui, sans-serif";
  options.forEach((t, i) => {
    const x = 36 + i * 250;
    const y = 330;
    button(ctx, x, y, 220, 60, "#f7d046", "#1b1b1b", t);
  });

  ctx.fillStyle = "#c6c6c6";
  ctx.font = "bold 28px ui-monospace";
  ctx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 430);

  ctx.font = "600 26px Inter, system-ui, sans-serif";
  let y = 480;
  aiLines.slice(-6).forEach((line) => {
    ctx.fillStyle = "#94a3b8";
    wrapText(line, 36, y, 950, 30);
    y += 44;
  });

  if (results) {
    ctx.fillStyle = "#f7d046";
    ctx.font = "700 32px ui-monospace";
    ctx.fillText("RESULTS", 36, 720 - 140);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 28px Inter, system-ui, sans-serif";
    let ry = 720 - 100;
    results.counts.forEach((c) => {
      ctx.fillText(`${c.text}: ${c.count}`, 36, ry);
      ry += 34;
    });
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "700 28px ui-monospace";
    ctx.fillText(results.winnersText, 36, ry + 10);
  }

  tabletTexture.needsUpdate = true;
}

function drawScoreboard(leaderboard) {
  if (!jumboCtx) return;
  const w = 512, h = 512;
  jumboCtx.clearRect(0, 0, w, h);
  jumboCtx.fillStyle = "#0a0a0a";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.fillStyle = "#f7d046";
  jumboCtx.font = "bold 36px ui-monospace";
  jumboCtx.fillText("SCOREBOARD", 110, 60);

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.font = "600 28px Inter";
  leaderboard.forEach((p, i) => {
    jumboCtx.fillText(`${p.name}: ${p.points}`, 80, 120 + i * 40);
  });

  jumbotronTexture.needsUpdate = true;
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else line = testLine;
  }
  ctx.fillText(line, x, y);
}

function button(ctx, x, y, w, h, fg, bg, label) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = fg;
  ctx.font = "700 26px Inter, system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  ctx.fillText(label, x + (w - tw) / 2, y + h / 2 + 9);
}

// ===================================================
// ================== INIT SCENE =====================
// ===================================================
export function initScene(aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"]) {
  if (document.querySelector("canvas#solo-bg")) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  document.body.appendChild(renderer.domElement);

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 2.2);
  camera.lookAt(0, 1.2, 0);

  // Controls (look-around)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI / 3;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(0, 1.2, 0);

  // Lighting — boosted
  scene.add(new THREE.AmbientLight(0x7070a0, 1.2));
  const spot = new THREE.SpotLight(0xffffff, 1.6, 20, Math.PI / 3, 0.3);
  spot.position.set(0, 6, 0);
  scene.add(spot);

  const tableLight = new THREE.PointLight(0xffd580, 0.6, 10);
  tableLight.position.set(0, 2.2, 0);
  scene.add(tableLight);

  // Floor + Table
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const table = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.25, 40), new THREE.MeshStandardMaterial({ color: 0x151515 }));
  table.position.y = 0.9;
  scene.add(table);

  // Seats + Nameplates
  const radius = 3.4;
  const chairGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
  const visibleAIs = aiNames.slice(1);

  visibleAIs.forEach((name, i) => {
    const a = THREE.MathUtils.degToRad(-60 + (i * 40));
    const chair = new THREE.Mesh(chairGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
    chair.position.set(Math.sin(a) * radius, 0.45, Math.cos(a) * radius);
    chair.lookAt(0, 0.45, 0);
    scene.add(chair);

    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x202024 }));
    body.position.set(chair.position.x, 1.1, chair.position.z);
    scene.add(body);

    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256; plateCanvas.height = 64;
    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "#000"; pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046"; pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center"; pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: plateTex, transparent: true, side: THREE.DoubleSide }));
    plate.position.set(chair.position.x, 1.7, chair.position.z);
    plate.lookAt(0, 1.2, 0);
    scene.add(plate);
  });

  // Player Tablet — rotated toward player
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 768;
  ctx = canvas.getContext("2d");
  tabletTexture = new THREE.CanvasTexture(canvas);
  const tabletMat = new THREE.MeshBasicMaterial({ map: tabletTexture, side: THREE.DoubleSide });
  const tabletGeo = new THREE.PlaneGeometry(1.9, 1.45);
  tabletMesh = new THREE.Mesh(tabletGeo, tabletMat);
  tabletMesh.position.set(0, 1.05, 1.15);
  tabletMesh.rotation.x = -0.3; // slightly leaning back
  scene.add(tabletMesh);
  drawTablet({ question: "Loading..." });

  // Jumbotron — lowered & emissive
  const jumboCanvas = document.createElement("canvas");
  jumboCanvas.width = 512; jumboCanvas.height = 512;
  jumboCtx = jumboCanvas.getContext("2d");
  jumbotronTexture = new THREE.CanvasTexture(jumboCanvas);
  const jumboMat = new THREE.MeshStandardMaterial({
    map: jumbotronTexture,
    emissive: 0x3355ff,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  jumbotron = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 3), jumboMat);
  jumbotron.position.set(0, 3.2, 0);
  scene.add(jumbotron);

  // Light for jumbotron
  const jumboLight = new THREE.PointLight(0x6688ff, 0.6, 8);
  jumboLight.position.set(0, 3.2, 0);
  scene.add(jumboLight);

  // Pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  pole.position.set(0, 4.0, 0);
  scene.add(pole);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

// ===================================================
// ================= PUBLIC API ======================
// ===================================================
export function updatePlayerTablet(payload) {
  drawTablet(payload || {});
}

export function updateScoreboard(leaderboard) {
  drawScoreboard(leaderboard || []);
}

export function showResultsMode(on) {
  if (jumbotron) jumbotron.visible = on;
}

function animate() {
  requestAnimationFrame(animate);
  if (jumbotron && jumbotron.visible) jumbotron.rotation.y += 0.002;
  controls.update();
  renderer.render(scene, camera);
}

// compatibility alias
export const updateSoloTablet = updatePlayerTablet;
