// ===================================================
// ================ IMPORTS & SETUP ==================
// ===================================================
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer, controls;
let tabletMesh, tabletTexture, ctx;
let jumbotron, jumbotronTexture, jumboCtx;

// Floating AI name-to-object and dialogue map
const playersMap = new Map();
const aiLabels = new Map();

// ===================================================
// =============== CANVAS DRAW HELPERS ===============
// ===================================================
function drawTablet({
  title = "MAJORITY LOSS — SOLO",
  question = "",
  options = [],
  timer = 0,
  aiLines = [],
}) {
  if (!ctx) return;
  const w = 1024, h = 768;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, w, h);

  // === TITLE ===
  ctx.fillStyle = "#f7d046";
  ctx.font = "bold 42px ui-monospace";
  ctx.fillText(title, 36, 65);

  // === QUESTION ===
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Inter";
  wrapText(question, 36, 125, 950, 42);

  // === OPTIONS ===
  ctx.font = "600 30px Inter";
  const buttonY = 210;
  options.forEach((t, i) => {
    const x = 36 + i * 250;
    button(ctx, x, buttonY, 220, 60, "#f7d046", "#1b1b1b", t);
  });

  // === TIMER ===
  ctx.fillStyle = "#c6c6c6";
  ctx.font = "bold 28px ui-monospace";
  ctx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 305);

  tabletTexture.needsUpdate = true;
}

function wrapText(text, x, y, maxWidth, lh) {
  const words = String(text || "").split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lh;
    } else line = test;
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
  ctx.font = "700 26px Inter";
  const tw = ctx.measureText(label).width;
  ctx.fillText(label, x + (w - tw) / 2, y + h / 2 + 9);
}

// ===================================================
// ================= JUMBOTRON DRAW ==================
// ===================================================
function drawJumbotronResults(results, roundNo) {
  if (!jumboCtx) return;
  const w = 512, h = 256;
  jumboCtx.clearRect(0, 0, w, h);
  jumboCtx.fillStyle = "#000";
  jumboCtx.fillRect(0, 0, w, h);

  jumboCtx.fillStyle = "#f7d046";
  jumboCtx.font = "bold 38px ui-monospace";
  jumboCtx.fillText(`ROUND ${roundNo} RESULTS`, 60, 60);

  jumboCtx.fillStyle = "#ffffff";
  jumboCtx.font = "600 26px Inter";
  let y = 110;
  results.counts.forEach(c => {
    jumboCtx.fillText(`${c.text}: ${c.count}`, 70, y);
    y += 32;
  });

  jumboCtx.fillStyle = "#a7f3d0";
  jumboCtx.font = "700 28px ui-monospace";
  jumboCtx.fillText(results.winnersText, 70, y + 30);

  jumbotronTexture.needsUpdate = true;
}

// ===================================================
// =============== AI DIALOGUE LABELS ================
// ===================================================
function showAIDialogue(name, text) {
  let label = aiLabels.get(name);
  if (!label) {
    const div = document.createElement("div");
    div.className = "ai-dialogue";
    div.style.position = "absolute";
    div.style.color = "#f7d046";
    div.style.fontFamily = "Inter, sans-serif";
    div.style.fontSize = "18px";
    div.style.textShadow = "0 0 6px rgba(0,0,0,0.8)";
    div.style.pointerEvents = "none";
    document.body.appendChild(div);
    aiLabels.set(name, div);
    label = div;
  }
  label.textContent = `${name}: ${text}`;
  label.style.opacity = "1";
  label.style.transition = "opacity 1s";

  // fade out after 4s
  setTimeout(() => {
    label.style.opacity = "0";
  }, 4000);
}

// ===================================================
// ================== INIT SCENE =====================
// ===================================================
export function initScene(aiNames = ["You", "Yumeko", "L", "Yuuichi", "Chishiya"]) {
  if (document.querySelector("#solo-bg")) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, -3.8);
  camera.lookAt(0, 1.2, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI / 3;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(0, 1.2, 0);

  // Lighting
  scene.add(new THREE.AmbientLight(0x9090c0, 1.3));
  const spot = new THREE.SpotLight(0xffffff, 1.4, 20, Math.PI / 3);
  spot.position.set(0, 5, 0);
  scene.add(spot);
  const fill = new THREE.PointLight(0xffc870, 0.6, 10);
  fill.position.set(0, 2, 0);
  scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7, 64),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 0.25, 40),
    new THREE.MeshStandardMaterial({ color: 0x151515 })
  );
  table.position.y = 0.9;
  scene.add(table);

  const radius = 3.4;
  const chairGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
  aiNames.slice(1).forEach((name, i) => {
    const a = THREE.MathUtils.degToRad(-70 + i * 45);
    const chair = new THREE.Mesh(chairGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
    chair.position.set(Math.sin(a) * radius, 0.45, Math.cos(a) * radius);
    chair.lookAt(0, 0.45, 0);
    scene.add(chair);

    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x222228 }));
    body.position.set(chair.position.x, 1.1, chair.position.z);
    scene.add(body);
    playersMap.set(name, body);

    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256; plateCanvas.height = 64;
    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "#000";
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046";
    pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center"; pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(plateCanvas),
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    plate.position.set(chair.position.x, 1.7, chair.position.z);
    plate.lookAt(0, 1.3, 0);
    scene.add(plate);
  });

  // Player Tablet
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 768;
  ctx = canvas.getContext("2d");
  tabletTexture = new THREE.CanvasTexture(canvas);
  const tabletMat = new THREE.MeshBasicMaterial({
    map: tabletTexture,
    side: THREE.DoubleSide,
  });
  const tabletGeo = new THREE.PlaneGeometry(0.95, 0.72);
  tabletMesh = new THREE.Mesh(tabletGeo, tabletMat);
  tabletMesh.position.set(0, 1.2, -2.3);
  tabletMesh.rotation.set(0.18, Math.PI, 0);
  scene.add(tabletMesh);
  drawTablet({ question: "Loading..." });

  // Jumbotron
  const jumboCanvas = document.createElement("canvas");
  jumboCanvas.width = 512; jumboCanvas.height = 256;
  jumboCtx = jumboCanvas.getContext("2d");
  jumbotronTexture = new THREE.CanvasTexture(jumboCanvas);
  const jumboMat = new THREE.MeshStandardMaterial({
    map: jumbotronTexture,
    emissive: 0x3355ff,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  jumbotron = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.8), jumboMat);
  jumbotron.position.set(0, 2.6, 0);
  scene.add(jumbotron);

  const jumboLight = new THREE.PointLight(0x6688ff, 0.5, 6);
  jumboLight.position.set(0, 2.6, 0);
  scene.add(jumboLight);

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
export function updatePlayerTablet(payload) { drawTablet(payload || {}); }
export function updateJumbotronResults(results, roundNo) { drawJumbotronResults(results, roundNo); }
export function showResultsMode(on) { if (jumbotron) jumbotron.visible = on; }
export function triggerAIDialogue(name, text) { showAIDialogue(name, text); }

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Update floating dialogue label positions
  for (const [name, div] of aiLabels.entries()) {
    const obj = playersMap?.get(name);
    if (!obj) continue;
    const pos = obj.position.clone();
    pos.y += 2.2;
    pos.project(camera);
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
  }

  if (jumbotron && jumbotron.visible) jumbotron.rotation.y += 0.002;
  renderer.render(scene, camera);
}
export const updateSoloTablet = updatePlayerTablet;
