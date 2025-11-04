// ===================================================
// ================ FAKE 3D SCENE SETUP ==============
// ===================================================
import * as THREE from "three";

let scene, camera, renderer, light;
let tabletMesh, tabletTexture, ctx;
let seats = [];
let nameplates = [];

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
  ctx.font = "bold 42px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
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
  ctx.font = "bold 28px ui-monospace, SFMono-Regular, Menlo";
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
    ctx.font = "700 32px ui-monospace, SFMono-Regular, Menlo";
    ctx.fillText("RESULTS", 36, 720 - 140);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 28px Inter, system-ui, sans-serif";
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
  scene.background = new THREE.Color(0x0a0a0a);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 2.2, 7.2);
  camera.lookAt(0, 1.0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  Object.assign(renderer.domElement.style, {
    position: "fixed",
    top: 0, left: 0, width: "100%", height: "100%", zIndex: 0,
  });
  document.body.appendChild(renderer.domElement);

  light = new THREE.PointLight(0xffe6b3, 1.1, 20);
  light.position.set(0, 4.2, 2);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040, 0.8));

  const floorGeo = new THREE.CircleGeometry(7, 64);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x101010 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const tableGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.25, 40);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x121212 });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.y = 0.9;
  scene.add(table);

  seats = [];
  nameplates = [];
  const chairGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
  const radius = 3.4;

  aiNames.forEach((name, i) => {
    const a = (i / aiNames.length) * Math.PI * 2 - Math.PI / 2;
    const chairMat = new THREE.MeshStandardMaterial({
      color: i === 0 ? 0x303742 : 0x222222
    });
    const chair = new THREE.Mesh(chairGeo, chairMat);
    chair.position.set(Math.cos(a) * radius, 0.45, Math.sin(a) * radius);
    chair.lookAt(0, 0.45, 0);
    seats.push(chair);
    scene.add(chair);

    // Nameplate
    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 256;
    plateCanvas.height = 64;
    const pctx = plateCanvas.getContext("2d");
    pctx.fillStyle = "#000";
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = "#f7d046";
    pctx.font = "bold 28px ui-monospace";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText(name, 128, 32);
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, transparent: true });
    const plateGeo = new THREE.PlaneGeometry(1.2, 0.3);
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(chair.position.x, 1.2, chair.position.z);
    plateMesh.lookAt(0, 1.2, 0);
    nameplates.push(plateMesh);
    scene.add(plateMesh);
  });

  // Tablet
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
export function updateSoloTablet(payload) {
  drawTablet(payload || {});
}

// ===================================================
// =============== CAMERA ANIMATION LOOP =============
// ===================================================
let mouseX = 0, mouseY = 0;
document.addEventListener("mousemove", (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

function animate() {
  requestAnimationFrame(animate);
  light.intensity = 1 + Math.sin(Date.now() * 0.004) * 0.3;

  // soft parallax camera sway
  if (camera) {
    camera.position.x += (mouseX * 1.8 - camera.position.x) * 0.03;
    camera.position.y += (2.2 - mouseY * 0.4 - camera.position.y) * 0.03;
    camera.lookAt(0, 1.0, 0);
  }

  renderer.render(scene, camera);
}
