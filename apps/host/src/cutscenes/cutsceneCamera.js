// cutsceneCamera.js
import * as THREE from "three";

let camera = null;
let isCutscene = false;

export function attachCutsceneCamera(cam) {
  camera = cam;
}

// Tween camera to a position + look target
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

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }

    animate();
  });
}

export function endCutscene() {
  isCutscene = false;
}

export function cutsceneActive() {
  return isCutscene;
}
