import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const palette = {
  ground: 0x1a1917,
  park: 0x24221e,
  parkDark: 0x2d2a24,
  road: 0x302e2a,
  roadEdge: 0x47433b,
  building: [0x716c62, 0x504d47, 0x8a8374, 0x62615d, 0x948a74],
  roof: [0x262522, 0x37342d, 0x62543a, 0x45433d],
  tree: [0x494841, 0x5d584c, 0x393937, 0x716954],
  window: 0xd9c18a
};

const material = (color, roughness = 1) => new THREE.MeshStandardMaterial({ color, roughness });

export function createNeighborhood(canvas, onSelect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.ground);
  scene.fog = new THREE.Fog(palette.ground, 36, 80);

  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 120);
  camera.position.set(16, 22, 26);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = true;
  controls.panSpeed = 0.55;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.72;
  controls.minDistance = 16;
  controls.maxDistance = 43;
  controls.minPolarAngle = 0.42;
  controls.maxPolarAngle = 1.28;
  controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 0.19;

  scene.add(new THREE.HemisphereLight(0xe8dfca, 0x34312a, 2.1));
  const sun = new THREE.DirectionalLight(0xf4e4bf, 3.1);
  sun.position.set(-12, 22, 11);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9c988e, 0.9);
  fill.position.set(12, 10, -15);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), material(palette.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.16;
  scene.add(ground);

  const grid = new THREE.GridHelper(38, 38, 0x6b614d, 0x45423b);
  grid.position.y = -0.145;
  grid.material.opacity = 0.34;
  grid.material.transparent = true;
  scene.add(grid);

  const roadMaterial = material(palette.road);
  const edgeMaterial = material(palette.roadEdge);
  for (const coordinate of [-10.5, -4.2, 2.2, 8.6]) {
    const verticalEdge = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 38), edgeMaterial);
    verticalEdge.position.set(coordinate, -0.05, 0);
    scene.add(verticalEdge);
    const verticalRoad = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.1, 38), roadMaterial);
    verticalRoad.position.set(coordinate, 0.01, 0);
    scene.add(verticalRoad);
    const horizontalEdge = new THREE.Mesh(new THREE.BoxGeometry(38, 0.12, 1.18), edgeMaterial);
    horizontalEdge.position.set(0, -0.05, coordinate);
    scene.add(horizontalEdge);
    const horizontalRoad = new THREE.Mesh(new THREE.BoxGeometry(38, 0.1, 0.94), roadMaterial);
    horizontalRoad.position.set(0, 0.01, coordinate);
    scene.add(horizontalRoad);
  }

  const parkMaterial = material(palette.park);
  for (const park of [[-7.4, -7.2, 4.3, 3.8], [5.5, 6.3, 4.1, 3.6], [-7.4, 5.9, 4.1, 3.3], [5.5, -7.2, 3.8, 3.1]]) {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(park[2], 0.08, park[3]), parkMaterial);
    lawn.position.set(park[0], -0.02, park[1]);
    scene.add(lawn);
  }

  const houseMaterial = palette.building.map((color) => material(color));
  const roofMaterial = palette.roof.map((color) => material(color));
  const glassMaterial = new THREE.MeshStandardMaterial({ color: palette.window, roughness: 0.25, metalness: 0.06 });
  const doorMaterial = material(0x3a3428);
  const treeMaterials = palette.tree.map((color) => material(color));
  const trunkMaterial = material(0x554c3a);
  const buildingTargets = new Map();
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const windowGeometry = new THREE.BoxGeometry(0.3, 0.34, 0.035);
  const treeGeometry = new THREE.IcosahedronGeometry(0.44, 1);
  const trunkGeometry = new THREE.CylinderGeometry(0.07, 0.09, 0.42, 6);

  function addHouse(x, z, options = {}) {
    const width = options.width || 1.5;
    const depth = options.depth || 1.35;
    const height = options.height || 1.3;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = options.rotation ?? ((Math.round(x * 13 + z * 7) % 3) - 1) * 0.12;

    const lot = new THREE.Mesh(new THREE.BoxGeometry(width + 0.78, 0.09, depth + 0.74), material(options.lotColor || palette.parkDark));
    lot.position.y = -0.01;
    group.add(lot);

    const walls = new THREE.Mesh(buildingGeometry, houseMaterial[options.tint ?? Math.abs(Math.round(x * 5 + z * 7)) % houseMaterial.length]);
    walls.position.y = 0.11 + height / 2;
    walls.scale.set(width, height, depth);
    group.add(walls);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, 0.16, depth + 0.12), roofMaterial[options.roof ?? Math.abs(Math.round(z * 8 - x * 4)) % roofMaterial.length]);
    roof.position.y = height + 0.15;
    group.add(roof);

    if (options.gabled) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.78, 0.8, 4), roofMaterial[options.roof ?? 0]);
      cap.rotation.y = Math.PI / 4;
      cap.position.y = height + 0.55;
      group.add(cap);
    }

    for (const [windowX, windowY] of [[-0.37, height * 0.57], [0.37, height * 0.57]]) {
      if (height > 0.9) {
        const windowPane = new THREE.Mesh(windowGeometry, glassMaterial);
        windowPane.position.set(windowX * width, windowY, depth / 2 + 0.025);
        group.add(windowPane);
      }
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.48, 0.045), doorMaterial);
    door.position.set(width * 0.23, 0.35, depth / 2 + 0.028);
    group.add(door);

    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    scene.add(group);
    if (options.listingId) buildingTargets.set(options.listingId, group);
    return group;
  }

  const treePositions = [
    [-8.9,-8.5],[-6.3,-8.8],[-8.3,-5.8],[-6.1,-5.9],[4.3,8.2],[6.7,8.4],[4.1,5.2],[7,5.3],
    [-8.7,8.2],[-6.2,8.1],[-8.5,4.7],[-6.1,4.5],[4.2,-8.8],[6.7,-8.6],[4.3,-5.2],[7,-5.2],
    [-2.6,-8.7],[0,-8.3],[3.8,-8.8],[-8.7,-2.7],[-5.8,-2.6],[-1.9,-2.4],[2.3,-2.7],[5.4,-2.5],
    [8.9,-2.9],[-8.8,2.1],[-5.7,2.6],[-1.6,2.4],[3.2,2.9],[5.6,2.5],[8.7,2.2],
    [-2.9,5.3],[0,5.7],[2.6,5.1],[-2.7,8.2],[0,8.8],[2.5,8.1],[-8.8,0.1],[8.9,0.2]
  ];
  treePositions.forEach(([x, z], index) => {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.19;
    const crown = new THREE.Mesh(treeGeometry, treeMaterials[index % treeMaterials.length]);
    crown.position.y = 0.7;
    crown.scale.set(1, 0.84 + (index % 3) * 0.09, 0.9);
    tree.add(trunk, crown);
    scene.add(tree);
  });

  const decorativeBuildings = [
    [-8,-0.8,1.7,1.8,2.9],[-7.8,1.3,1.6,1.4,2.2],[-0.6,-8,1.8,1.6,2.4],
    [1.5,-7.8,1.7,1.5,1.7],[-8,7.5,1.8,1.3,2.5],[7.5,7.7,1.8,1.8,2.8],
    [7.9,-7.4,2,1.8,2.5],[-1.9,7.4,1.8,1.6,1.9]
  ];
  decorativeBuildings.forEach((building, index) => addHouse(...building.slice(0, 2), { width: building[2], depth: building[3], height: building[4], tint: index % houseMaterial.length, roof: (index + 2) % roofMaterial.length, gabled: index % 3 === 0 }));

  const selectionRingMaterial = new THREE.MeshBasicMaterial({ color: 0xe2c98d, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  const selectionRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.73, 48), selectionRingMaterial);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.075;
  selectionRing.visible = false;
  scene.add(selectionRing);

  const markerObjects = new Map();
  const markerGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 16);
  const markerMaterials = {
    buy: material(0xd8c28f, 0.5),
    rent: material(0xa9a69f, 0.5),
    commercial: material(0xb6a77f, 0.5)
  };
  let liveListings = [];

  function syncListings(listings, selectedId) {
    liveListings = listings;
    const listingIds = new Set(listings.map((listing) => listing.id));
    for (const [id, marker] of markerObjects) {
      if (!listingIds.has(id)) {
        scene.remove(marker);
        markerObjects.delete(id);
      }
    }
    for (const listing of listings) {
      let marker = markerObjects.get(listing.id);
      if (!marker) {
        marker = new THREE.Mesh(markerGeometry, markerMaterials[listing.mode] || markerMaterials.buy);
        marker.rotation.x = Math.PI / 2;
        marker.position.set(listing.x, 0.18, listing.z);
        marker.userData.listingId = listing.id;
        scene.add(marker);
        markerObjects.set(listing.id, marker);
        if (!buildingTargets.has(listing.id)) {
          addHouse(listing.x, listing.z, { listingId: listing.id, tint: Math.floor(Math.random() * houseMaterial.length), gabled: listing.type === "Villa" });
        }
      }
    }
    if (selectedId) select(selectedId);
  }

  function select(id) {
    const listing = liveListings.find((item) => item.id === id);
    const building = buildingTargets.get(id);
    if (!listing || !building) return;
    selectionRing.position.x = listing.x;
    selectionRing.position.z = listing.z;
    selectionRing.visible = true;
    controls.target.set(listing.x, 0.75, listing.z);
    controls.update();
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  canvas.addEventListener("pointerdown", (event) => { pointerDown = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
    pointerDown = null;
    const bounds = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const found = raycaster.intersectObjects([...markerObjects.values()], false)[0]?.object.userData.listingId;
    if (found) onSelect(found);
  });

  const markerPosition = new THREE.Vector3();
  let renderFrame = 0;
  function projectMarkers() {
    if (renderFrame % 2) return [];
    return liveListings.map((listing) => {
      const building = buildingTargets.get(listing.id);
      if (!building) return null;
      markerPosition.set(listing.x, building.position.y + 2.6, listing.z).project(camera);
      const visible = markerPosition.z < 1 && markerPosition.z > -1 && Math.abs(markerPosition.x) < 1.12 && Math.abs(markerPosition.y) < 1.15;
      return { id: listing.id, x: (markerPosition.x * 0.5 + 0.5) * canvas.clientWidth, y: (-markerPosition.y * 0.5 + 0.5) * canvas.clientHeight, visible };
    }).filter(Boolean);
  }

  function resize() {
    const container = canvas.parentElement;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  window.addEventListener("resize", resize);
  resize();

  let disposed = false;
  function animate() {
    if (disposed) return;
    renderFrame += 1;
    controls.update();
    renderer.render(scene, camera);
    if (renderFrame % 2 === 0) canvas.dispatchEvent(new CustomEvent("scene:frame", { detail: projectMarkers() }));
  }
  renderer.setAnimationLoop(animate);

  const reset = () => {
    controls.target.set(0, 0.8, 0);
    camera.position.set(16, 22, 26);
    controls.update();
  };
  return {
    syncListings,
    select,
    reset,
    focus: (id) => select(id),
    onThemeChange(theme) {
      const color = theme === "light" ? 0xd6d3cb : 0x111110;
      scene.background.setHex(color);
      scene.fog.color.setHex(color);
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      controls.dispose();
      scene.traverse((object) => {
        if (object.isMesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((entry) => entry.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
    }
  };
}
