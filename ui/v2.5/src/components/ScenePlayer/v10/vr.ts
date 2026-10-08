import * as THREE from "three";

export type VRProjection = "180_LR" | "360_TB" | "360";

const DRAG_THRESHOLD = 4;

// Replaces @blaineam/videojs-vr: draws one eye of the video on the inside of a sphere, and dragging looks around.
export function startVR(
  container: HTMLElement,
  video: HTMLVideoElement,
  projection: VRProjection
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const canvas = renderer.domElement;
  canvas.className = "stash-vr-canvas";
  container.insertBefore(
    canvas,
    video.parentElement === container ? video.nextSibling : container.firstChild
  );

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;

  const half = projection === "180_LR";
  const geometry = new THREE.SphereGeometry(
    500,
    64,
    32,
    half ? Math.PI / 2 : 0,
    half ? Math.PI : Math.PI * 2
  );
  geometry.scale(-1, 1, 1);

  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    if (projection === "180_LR") uv.setX(i, uv.getX(i) * 0.5);
    if (projection === "360_TB") uv.setY(i, uv.getY(i) * 0.5 + 0.5);
  }

  const material = new THREE.MeshBasicMaterial({ map: texture });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));

  // Longitude 180 faces the middle of the frame.
  let lon = 180;
  let lat = 0;
  let drag: { x: number; y: number; lon: number; lat: number } | undefined;
  let dragged = false;

  function onPointerDown(e: PointerEvent) {
    drag = { x: e.clientX, y: e.clientY, lon, lat };
    dragged = false;
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    dragged ||= Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD;
    lon = drag.lon - dx * 0.1;
    lat = Math.max(-85, Math.min(85, drag.lat + dy * 0.1));
  }

  // A drag must not reach the skin's tap gesture on the container, which would toggle playback.
  function onPointerUp(e: PointerEvent) {
    if (dragged) e.stopPropagation();
    drag = undefined;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    camera.fov = Math.max(30, Math.min(100, camera.fov + e.deltaY * 0.05));
    camera.updateProjectionMatrix();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const resizeObserver = new ResizeObserver(() => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  const target = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon);
    target.setFromSphericalCoords(1, phi, theta);
    // setFromSphericalCoords puts theta 0 on +z, the panorama example on +x, so swap them.
    camera.lookAt(target.z, target.y, target.x);
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    canvas.remove();
    geometry.dispose();
    material.dispose();
    texture.dispose();
    renderer.dispose();
  };
}
