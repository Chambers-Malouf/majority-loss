import * as THREE from "three";

let camera = null;
let isCutscene = false;

// Store original gameplay camera state
let savedGameplayPos = null;
let savedGameplayLook = null;

export function attachCutsceneCamera(cam) {
  camera = cam;
}

/* ----------------------------------------------------------
    CUTSCENE STATE CONTROL
---------------------------------------------------------- */

export function startCutscene() {
  if (!camera) return;

  isCutscene = true;

  // Save camera state before cutscene hijacks it
  savedGameplayPos = camera.position.clone();

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  savedGameplayLook = camera.position.clone().add(dir);
}

export function stopCutscene() {
  if (!camera) return;

  // Restore gameplay camera
  if (savedGameplayPos) camera.position.copy(savedGameplayPos);
  if (savedGameplayLook) camera.lookAt(savedGameplayLook);

  isCutscene = false;
}

export function cutsceneActive() {
  return isCutscene;
}

/* ----------------------------------------------------------
    CAMERA TWEEN
---------------------------------------------------------- */

export function moveCameraTo(pos, look, duration = 1.5) {
  return new Promise((resolve) => {
    if (!camera) return resolve();

    isCutscene = true;

    const startPos = camera.position.clone();
    const startLook = new THREE.Vector3();
    camera.getWorldDirection(startLook);
    startLook.add(camera.position);

    const endPos = pos.clone();
    const endLook = look.clone();

    let t = 0;

    function animate() {
      t += 1 / (60 * duration);
      if (t >= 1) t = 1;

      camera.position.lerpVectors(startPos, endPos, t);
      const curLook = new THREE.Vector3().lerpVectors(startLook, endLook, t);
      camera.lookAt(curLook);

      if (t < 1) requestAnimationFrame(animate);
      else resolve();
    }

    animate();
  });
}
