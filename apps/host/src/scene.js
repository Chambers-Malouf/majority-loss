// ===================================================
// ================ FAKE 3D SCENE SETUP ==============
// ===================================================
import * as THREE from "three";

let scene, camera, renderer, light;
let tabletMesh;            // player's tablet plane
let tabletTexture, ctx;    // canvas texture for tablet
let seats = [];            // 5 seats (player + 4 AIs)

// ---------------------------------------------------
// internal: (re)draw text to the tablet texture
function drawTablet({
  title = "MAJORITY LOSS — SOLO",
  question = "",
  options = [],
  timer = 0,
  aiLines = [],
  results = null,    // {counts: [{text,count}], winnersText}
}) {
  if (!ctx) return;

  const w = 1024, h = 768;
  ctx.clearRect(0, 0, w, h);

  // panel background
  ctx.fillStyle = "#151515";
  ctx.fillRect(0, 0, w, h);

  // header
  ctx.fillStyle = "#f7d046";
  ctx.font = "bold 42px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillText(title, 36, 70);

  // question
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  wrapText(question, 36, 140, 950, 42);

  // options row
  ctx.font = "600 30px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  options.forEach((t, i) => {
    const x = 36 + i * 250;
    const y = 330;
    button(ctx, x, y, 220, 60, "#f7d046", "#1b1b1b", t);
  });

  // timer
  ctx.fillStyle = "#c6c6c6";
  ctx.font = "bold 28px ui-monospace, SFMono-Regular, Menlo";
  ctx.fillText(`TIME: ${Math.max(0, timer)}s`, 36, 430);

  // AI lines
  ctx.font = "600 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  let y = 480;
  aiLines.slice(-6).forEach((line) => {
    ctx.fillStyle = "#94a3b8";
    wrapText(line, 36, y, 950, 30);
    y += 44;
  });

  // results (if any)
  if (results) {
    ctx.fillStyle = "#f7d046";
    ctx.font = "700 32px ui-monospace, SFMono-Regular, Menlo";
    ctx.fillText("RESULTS", 36, 720 - 140);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 28px Inter, system-ui, -apple-system, Segoe UI, Roboto";
    let ry = 720 - 100;
    results.counts.forEach((c) => {
      ctx.fillText(`${c.text}: ${c.count}`, 36, ry);
      ry += 34;
    });
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "700 28px ui-monospace, SFMono-Regular, Menlo";
    ctx.fillText(results.winnersText, 36, ry + 10);
  }

  tabletTexture.needsUpdate = true;
}

// helper: wrapped text
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
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// helper: button look
function button(ctx, x, y, w, h, fg, bg, label) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = fg;
  ctx.font = "700 26px Inter, system-ui, -apple-system, Segoe UI, Roboto";
  const tw = ctx.measureText(label).width;
  ctx.fillText(label, x + (w - tw) / 2, y + h / 2 + 9);
}

// ===================================================
// ================== INIT SCENE =====================
// ===================================================
export function initScene() {
  // prevent duplicates
  if (document.querySelector("canvas#solo-bg")) return;

  // scene/camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 2.2, 6);

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  Object.assign(renderer.domElement.style, {
    position: "fixed",
    top: 0, left: 0, width: "100%", height: "100%", zIndex: 0,
  });
  document.body.appendChild(renderer.domElement);

  // lighting
  light = new THREE.PointLight(0xffe6b3, 1.2, 15);
  light.position.set(0, 5, 0);
  scene.add(light);

  const rim = new THREE.HemisphereLight(0x404040, 0x080808, 0.6);
  scene.add(rim);

  // floor
  const floorGeo = new THREE.CircleGeometry(7, 64);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x101010 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // simple round table
  const tableGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.25, 40);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x121212 });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.y = 0.9;
  scene.add(table);

  // 5 seats in a pentagon (player at index 0, front/center)
  seats = [];
  const chairGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const chairMatPlayer = new THREE.MeshStandardMaterial({ color: 0x303742 });
  const chairMatAI = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const radius = 3.4;

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2; // start front center
    const chair = new THREE.Mesh(chairGeo, i === 0 ? chairMatPlayer : chairMatAI);
    chair.position.set(Math.cos(a) * radius, 0.45, Math.sin(a) * radius);
    chair.lookAt(0, 0.45, 0);
    seats.push(chair);
    scene.add(chair);
  }

  // player's tablet (facing player)
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  ctx = canvas.getContext("2d");
  tabletTexture = new THREE.CanvasTexture(canvas);
  const tabletMat = new THREE.MeshBasicMaterial({ map: tabletTexture });
  const tabletGeo = new THREE.PlaneGeometry(1.9, 1.45);
  tabletMesh = new THREE.Mesh(tabletGeo, tabletMat);
  tabletMesh.position.set(0, 1.6, 1.8);
  tabletMesh.rotation.x = -0.22;
  scene.add(tabletMesh);

  drawTablet({ title: "MAJORITY LOSS — SOLO", question: "Loading...", options: [], timer: 0, aiLines: [] });

  // resize
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

// ===================================================
// ================= PUBLIC API (UI) =================
// ===================================================
export function updateSoloTablet(payload) {
  drawTablet(payload || {});
}

// (optional) focus camera on any seat index 0..4 (player=0)
export function focusCameraOnSeat(idx = 0, lerp = 0.12) {
  if (!seats[idx]) return;
  const target = seats[idx].position.clone().multiplyScalar(0.6);
  const desired = new THREE.Vector3(target.x, 2.2, target.z + 6);
  camera.position.lerp(desired, lerp);
  camera.lookAt(0, 1.2, 0);
}

// ===================================================
// ================== ANIMATION LOOP =================
// ===================================================
function animate() {
  requestAnimationFrame(animate);
  light.intensity = 1 + Math.sin(Date.now() * 0.004) * 0.3;
  renderer.render(scene, camera);
}
