// ===================================================
// ================ FAKE 3D SCENE SETUP ===============
// ===================================================
import * as THREE from "three";

let scene, camera, renderer, light;

// ===================================================
// ================== INIT SCENE =====================
// ===================================================
export function initScene() {
  // Prevent multiple canvases from stacking
  if (document.querySelector("canvas#solo-bg")) return;

  // --- Create Scene ---
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  // --- Camera ---
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 3, 6);

  // --- Renderer ---
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = "solo-bg";
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.top = 0;
  renderer.domElement.style.left = 0;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.zIndex = 0;
  document.body.appendChild(renderer.domElement);

  // --- Lighting ---
  light = new THREE.PointLight(0xffe6b3, 1.2, 15);
  light.position.set(0, 5, 0);
  scene.add(light);

  // --- Floor ---
  const floorGeo = new THREE.PlaneGeometry(10, 10);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // --- Tablets (representing AI players) ---
  const tabletGeo = new THREE.PlaneGeometry(1.2, 0.8);
  const tabletMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const radius = 3;
  for (let i = 0; i < 4; i++) {
    const tablet = new THREE.Mesh(tabletGeo, tabletMat);
    const angle = (i / 4) * Math.PI * 2;
    tablet.position.set(Math.cos(angle) * radius, 1.0, Math.sin(angle) * radius);
    tablet.lookAt(0, 1.0, 0);
    scene.add(tablet);
  }

  // --- Start Animation Loop ---
  animate();
}

// ===================================================
// ================== ANIMATION LOOP =================
// ===================================================
function animate() {
  requestAnimationFrame(animate);
  light.intensity = 1 + Math.sin(Date.now() * 0.01) * 0.3;
  renderer.render(scene, camera);
}
