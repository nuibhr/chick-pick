import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Player, ArenaLightingMode } from '../types';
import { retroAudio } from '../audio/retroAudio';

interface PickleballSceneProps {
  players: Player[];
  activeCourtId: number;
  onSelectPlayer: (player: Player) => void;
  onSelectCourt: (courtId: number) => void;
  onBallHit?: () => void;
  lightingMode: ArenaLightingMode;
  cameraPreset: 'isometric' | 'topdown' | 'action';
  isRallyActive: boolean;
  onToggleRally: () => void;
}

interface TrainerObject {
  group: THREE.Group;
  player: Player;
  paddleMesh: THREE.Mesh;
  baseY: number;
  initialX: number;
  initialZ: number;
  swingAnim: number; // 0 to 1
}

export const PickleballScene: React.FC<PickleballSceneProps> = ({
  players,
  activeCourtId,
  onSelectPlayer,
  onSelectCourt,
  onBallHit,
  lightingMode,
  cameraPreset,
  isRallyActive,
  onToggleRally
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const trainersRef = useRef<TrainerObject[]>([]);
  const courtHighlightsRef = useRef<{ [key: number]: THREE.Mesh }>({});
  const lightsRef = useRef<{
    ambient?: THREE.HemisphereLight;
    dir?: THREE.DirectionalLight;
    pointGym?: THREE.PointLight;
  }>({});

  // Ball animation state
  const ballStateRef = useRef({
    mesh: null as THREE.Mesh | null,
    shadow: null as THREE.Mesh | null,
    courtX: -6.0,
    targetZ: 4.5,
    startZ: -4.5,
    t: 0,
    speed: 0.85,
    direction: 1, // 1: towards Side A (positive Z), -1: towards Side B (negative Z)
    peakHeight: 2.2,
    hitPending: false
  });

  // Bounce particles
  const particlesRef = useRef<THREE.Mesh[]>([]);

  /* 8-bit Procedural Pixel Texture Generators */
  function createPixelGrassTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d')!;
    // Classic Pokémon Gen 3 Route Grass Colors
    ctx.fillStyle = '#2f7d3a';
    ctx.fillRect(0, 0, 16, 16);

    ctx.fillStyle = '#256630';
    ctx.fillRect(2, 2, 2, 2);
    ctx.fillRect(10, 4, 2, 2);
    ctx.fillRect(6, 10, 2, 2);
    ctx.fillRect(12, 12, 2, 2);

    ctx.fillStyle = '#3ca04b';
    ctx.fillRect(4, 3, 2, 2);
    ctx.fillRect(12, 5, 2, 2);
    ctx.fillRect(8, 11, 2, 2);

    // Pokémon flower speckles
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(3, 8, 2, 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(13, 2, 2, 2);

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(18, 22);
    return tex;
  }

  function createPixelCourtTexture(isKitchen: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = isKitchen ? '#184739' : '#23604b';
    ctx.fillRect(0, 0, 16, 16);

    ctx.fillStyle = isKitchen ? '#113529' : '#1b4d3c';
    for (let x = 0; x < 16; x += 4) {
      for (let y = 0; y < 16; y += 4) {
        if ((x + y) % 8 === 0) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 14);
    return tex;
  }

  function createPixelPokeballTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);

    // Black outer
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();

    // Red top
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(16, 16, 13, Math.PI, 0);
    ctx.fill();

    // White bottom
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(16, 16, 13, 0, Math.PI);
    ctx.fill();

    // Center black line
    ctx.fillStyle = '#111827';
    ctx.fillRect(3, 14, 26, 4);

    // Center button outer
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(16, 16, 6, 0, Math.PI * 2);
    ctx.fill();

    // Center button inner glowing lime
    ctx.fillStyle = '#B8F23A';
    ctx.beginPath();
    ctx.arc(16, 16, 3.5, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  function createPixelNetTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(0, 0, 8, 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 7, 7);

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 4);
    return tex;
  }

  // Setup Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0a1410);
    scene.fog = new THREE.FogExp2(0x0a1410, 0.018);

    // 2. Camera: 2.5D Orthographic
    const aspect = width / height;
    const d = 14;
    const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 1000);
    camera.position.set(22, 18, 22);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minZoom = 0.6;
    controls.maxZoom = 2.4;
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.HemisphereLight(0xFDE68A, 0x166534, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.25);
    dirLight.position.set(18, 30, 16);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    const gymRimLight = new THREE.PointLight(0xB8F23A, 2.0, 35);
    gymRimLight.position.set(-16, 12, -16);
    scene.add(gymRimLight);

    lightsRef.current = { ambient: ambientLight, dir: dirLight, pointGym: gymRimLight };

    // 6. Build Diorama Island Slab
    const slabGeo = new THREE.BoxGeometry(26, 2.0, 32);
    const grassMat = new THREE.MeshStandardMaterial({
      map: createPixelGrassTexture(),
      roughness: 0.9,
      metalness: 0.05
    });
    const slab = new THREE.Mesh(slabGeo, grassMat);
    slab.position.y = -1.0;
    slab.receiveShadow = true;
    scene.add(slab);

    // Stepped border
    const borderGeo = new THREE.BoxGeometry(26.4, 0.5, 32.4);
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.y = -0.25;
    border.receiveShadow = true;
    scene.add(border);

    // Outer rock base
    const rockGeo = new THREE.BoxGeometry(27.2, 0.6, 33.2);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x070b09 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = -0.65;
    scene.add(rock);

    // Center divider path between courts
    const pathGeo = new THREE.BoxGeometry(1.6, 0.05, 24);
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const centerPath = new THREE.Mesh(pathGeo, pathMat);
    centerPath.position.set(0, 0.02, 0);
    centerPath.receiveShadow = true;
    scene.add(centerPath);

    // Court construction helper
    function buildCourt(courtX: number, courtId: number, name: string) {
      const courtGroup = new THREE.Group();
      courtGroup.name = `court_${courtId}`;
      courtGroup.userData = { courtId, name };

      const courtWidth = 6.4;
      const courtLength = 13.4;
      const kitchenLength = 4.26; // 2.13m each side

      // Main Court Floor
      const floorGeo = new THREE.BoxGeometry(courtWidth, 0.08, courtLength);
      const floorMat = new THREE.MeshStandardMaterial({
        map: createPixelCourtTexture(false),
        roughness: 0.8,
        metalness: 0.05
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.y = 0.04;
      floor.receiveShadow = true;
      courtGroup.add(floor);

      // Kitchen Zone Floor (Non-Volley Zone)
      const kitchenGeo = new THREE.BoxGeometry(courtWidth, 0.09, kitchenLength);
      const kitchenMat = new THREE.MeshStandardMaterial({
        map: createPixelCourtTexture(true),
        roughness: 0.8,
        metalness: 0.05
      });
      const kitchen = new THREE.Mesh(kitchenGeo, kitchenMat);
      kitchen.position.y = 0.045;
      kitchen.receiveShadow = true;
      courtGroup.add(kitchen);

      // Center Pokéball logo in center of kitchen
      const pokeballGeo = new THREE.PlaneGeometry(2.0, 2.0);
      const pokeballMat = new THREE.MeshBasicMaterial({
        map: createPixelPokeballTexture(),
        transparent: true
      });
      const pokeball = new THREE.Mesh(pokeballGeo, pokeballMat);
      pokeball.rotation.x = -Math.PI / 2;
      pokeball.position.y = 0.1;
      courtGroup.add(pokeball);

      // White Lines
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

      // Outer boundary lines
      const boundGeoZ = new THREE.BoxGeometry(0.12, 0.1, courtLength);
      const leftLine = new THREE.Mesh(boundGeoZ, lineMat);
      leftLine.position.set(-courtWidth / 2 + 0.06, 0.05, 0);
      courtGroup.add(leftLine);

      const rightLine = new THREE.Mesh(boundGeoZ, lineMat);
      rightLine.position.set(courtWidth / 2 - 0.06, 0.05, 0);
      courtGroup.add(rightLine);

      const boundGeoX = new THREE.BoxGeometry(courtWidth, 0.1, 0.12);
      const baselineA = new THREE.Mesh(boundGeoX, lineMat);
      baselineA.position.set(0, 0.05, courtLength / 2 - 0.06);
      courtGroup.add(baselineA);

      const baselineB = new THREE.Mesh(boundGeoX, lineMat);
      baselineB.position.set(0, 0.05, -courtLength / 2 + 0.06);
      courtGroup.add(baselineB);

      // Kitchen lines (NVZ line)
      const kitchenLineA = new THREE.Mesh(boundGeoX, lineMat);
      kitchenLineA.position.set(0, 0.05, kitchenLength / 2);
      courtGroup.add(kitchenLineA);

      const kitchenLineB = new THREE.Mesh(boundGeoX, lineMat);
      kitchenLineB.position.set(0, 0.05, -kitchenLength / 2);
      courtGroup.add(kitchenLineB);

      // Center service lines (from kitchen line to baseline)
      const serviceLen = (courtLength - kitchenLength) / 2;
      const centerLineGeo = new THREE.BoxGeometry(0.1, 0.1, serviceLen);

      const centerLineA = new THREE.Mesh(centerLineGeo, lineMat);
      centerLineA.position.set(0, 0.05, kitchenLength / 2 + serviceLen / 2);
      courtGroup.add(centerLineA);

      const centerLineB = new THREE.Mesh(centerLineGeo, lineMat);
      centerLineB.position.set(0, 0.05, -kitchenLength / 2 - serviceLen / 2);
      courtGroup.add(centerLineB);

      // Net and Net Posts
      const postMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
      const postGeo = new THREE.BoxGeometry(0.18, 1.2, 0.18);

      const postL = new THREE.Mesh(postGeo, postMat);
      postL.position.set(-courtWidth / 2 - 0.2, 0.6, 0);
      postL.castShadow = true;
      courtGroup.add(postL);

      const postR = new THREE.Mesh(postGeo, postMat);
      postR.position.set(courtWidth / 2 + 0.2, 0.6, 0);
      postR.castShadow = true;
      courtGroup.add(postR);

      // Net Mesh
      const netGeo = new THREE.BoxGeometry(courtWidth + 0.3, 0.85, 0.04);
      const netMat = new THREE.MeshStandardMaterial({
        map: createPixelNetTexture(),
        transparent: true,
        opacity: 0.85,
        roughness: 0.5
      });
      const netMesh = new THREE.Mesh(netGeo, netMat);
      netMesh.position.set(0, 0.52, 0);
      netMesh.castShadow = true;
      courtGroup.add(netMesh);

      // White Net Top Tape
      const netTapeGeo = new THREE.BoxGeometry(courtWidth + 0.4, 0.08, 0.08);
      const netTapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const netTape = new THREE.Mesh(netTapeGeo, netTapeMat);
      netTape.position.set(0, 0.95, 0);
      courtGroup.add(netTape);

      // Interactive Court Selection Highlight Ring
      const ringGeo = new THREE.BoxGeometry(courtWidth + 0.6, 0.05, courtLength + 0.6);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xB8F23A,
        wireframe: true,
        transparent: true,
        opacity: courtId === activeCourtId ? 0.9 : 0.15
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.09;
      courtGroup.add(ring);
      courtHighlightsRef.current[courtId] = ring;

      // 3D Voxel Court Label Stand
      const standGroup = new THREE.Group();
      standGroup.position.set(-courtWidth / 2 - 0.9, 0, -courtLength / 2 + 1.0);

      const signBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), postMat);
      signBase.position.y = 0.4;
      standGroup.add(signBase);

      const signBoard = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.6, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 })
      );
      signBoard.position.set(0, 0.9, 0);
      standGroup.add(signBoard);

      const signGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xB8F23A })
      );
      signGlow.position.set(0, 0.9, 0.09);
      standGroup.add(signGlow);

      courtGroup.add(standGroup);

      courtGroup.position.x = courtX;
      scene.add(courtGroup);
    }

    buildCourt(-6.5, 1, 'คอร์ต 1 (Gym A Arena)');
    buildCourt(6.5, 2, 'คอร์ต 2 (Gym B Arena)');

    // 7. Bouncing Voxel Pickleball
    const ballGeo = new THREE.BoxGeometry(0.36, 0.36, 0.36);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xB8F23A,
      roughness: 0.2,
      emissive: 0x557700
    });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.castShadow = true;
    ball.position.set(-6.5, 1.2, 0);
    scene.add(ball);
    ballStateRef.current.mesh = ball;

    // Ball Square Shadow
    const shadowGeo = new THREE.PlaneGeometry(0.48, 0.48);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45
    });
    const ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
    ballShadow.rotation.x = -Math.PI / 2;
    ballShadow.position.set(-6.5, 0.06, 0);
    scene.add(ballShadow);
    ballStateRef.current.shadow = ballShadow;

    // 8. Spawn Voxel Pokémon Trainers
    trainersRef.current = [];

    function spawnVoxelTrainer(player: Player, x: number, y: number, z: number, isServing: boolean) {
      const g = new THREE.Group();
      g.name = `trainer_${player.id}`;
      g.userData = { player };

      // Materials
      const skinMat = new THREE.MeshLambertMaterial({ color: 0xFCD34D });
      const capMat = new THREE.MeshLambertMaterial({ color: player.capColor });
      const shirtMat = new THREE.MeshLambertMaterial({ color: player.shirtColor });
      const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1E293B });
      const shoeMat = new THREE.MeshLambertMaterial({ color: 0xF8FAFC });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x111827 });

      // Torso / Jersey (0.6w x 0.7h x 0.4d)
      const torsoGeo = new THREE.BoxGeometry(0.6, 0.7, 0.4);
      const torso = new THREE.Mesh(torsoGeo, shirtMat);
      torso.position.y = 0.95;
      torso.castShadow = true;
      g.add(torso);

      // Head (0.55w x 0.55h x 0.55d)
      const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.y = 1.55;
      head.castShadow = true;
      g.add(head);

      // Trainer Cap (Pokémon style baseball cap with brim)
      const capCrownGeo = new THREE.BoxGeometry(0.6, 0.28, 0.6);
      const capCrown = new THREE.Mesh(capCrownGeo, capMat);
      capCrown.position.y = 1.76;
      capCrown.castShadow = true;
      g.add(capCrown);

      // Cap Brim facing court center (toward net z=0)
      const brimDir = z > 0 ? -1 : 1;
      const brimGeo = new THREE.BoxGeometry(0.58, 0.08, 0.35);
      const brim = new THREE.Mesh(brimGeo, capMat);
      brim.position.set(0, 1.68, brimDir * 0.38);
      g.add(brim);

      // White cap emblem (Pokéball logo patch)
      const emblemGeo = new THREE.PlaneGeometry(0.2, 0.16);
      const emblem = new THREE.Mesh(emblemGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      emblem.position.set(0, 1.76, brimDir * 0.31);
      if (brimDir > 0) emblem.rotation.y = Math.PI;
      g.add(emblem);

      // Pixel Eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
      const eyeGeo = new THREE.PlaneGeometry(0.08, 0.1);

      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.14, 1.55, brimDir * 0.28);
      if (brimDir > 0) eyeL.rotation.y = Math.PI;
      g.add(eyeL);

      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(0.14, 1.55, brimDir * 0.28);
      if (brimDir > 0) eyeR.rotation.y = Math.PI;
      g.add(eyeR);

      // Legs / Shorts
      const legGeo = new THREE.BoxGeometry(0.24, 0.5, 0.24);
      const legL = new THREE.Mesh(legGeo, pantsMat);
      legL.position.set(-0.16, 0.42, 0);
      legL.castShadow = true;
      g.add(legL);

      const legR = new THREE.Mesh(legGeo, pantsMat);
      legR.position.set(0.16, 0.42, 0);
      legR.castShadow = true;
      g.add(legR);

      // Shoes
      const shoeGeo = new THREE.BoxGeometry(0.26, 0.18, 0.32);
      const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
      shoeL.position.set(-0.16, 0.1, brimDir * 0.04);
      shoeL.castShadow = true;
      g.add(shoeL);

      const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
      shoeR.position.set(0.16, 0.1, brimDir * 0.04);
      shoeR.castShadow = true;
      g.add(shoeR);

      // Arms
      const armGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
      const armL = new THREE.Mesh(armGeo, shirtMat);
      armL.position.set(-0.38, 0.9, 0);
      g.add(armL);

      const armR = new THREE.Mesh(armGeo, shirtMat);
      armR.position.set(0.38, 0.9, 0);
      g.add(armR);

      // Pickleball Paddle in right hand!
      const paddleGroup = new THREE.Group();
      paddleGroup.position.set(0.46, 0.75, brimDir * 0.15);

      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), darkMat);
      handleMesh.position.y = -0.05;
      paddleGroup.add(handleMesh);

      // Paddle Blade (carbon raw face with colored edge guard)
      const bladeGeo = new THREE.BoxGeometry(0.32, 0.42, 0.04);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.3,
        metalness: 0.1
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.24;
      blade.castShadow = true;
      paddleGroup.add(blade);

      // Paddle Edge Trim (Lime accent)
      const edgeGeo = new THREE.BoxGeometry(0.34, 0.44, 0.02);
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xB8F23A });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.y = 0.24;
      paddleGroup.add(edge);

      g.add(paddleGroup);

      // Floating Name Badge Billboard
      const badgeCanvas = document.createElement('canvas');
      badgeCanvas.width = 128;
      badgeCanvas.height = 36;
      const bCtx = badgeCanvas.getContext('2d')!;
      bCtx.fillStyle = 'rgba(17, 24, 39, 0.85)';
      bCtx.fillRect(0, 0, 128, 36);
      bCtx.strokeStyle = '#B8F23A';
      bCtx.lineWidth = 2;
      bCtx.strokeRect(1, 1, 126, 34);

      bCtx.fillStyle = '#ffffff';
      bCtx.font = 'bold 15px sans-serif';
      bCtx.textAlign = 'center';
      bCtx.fillText(player.name, 64, 24);

      const badgeTex = new THREE.CanvasTexture(badgeCanvas);
      badgeTex.magFilter = THREE.NearestFilter;
      const badgeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.26),
        new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true })
      );
      badgeMesh.position.set(0, 2.15, 0);
      g.add(badgeMesh);

      // Position in diorama
      g.position.set(x, y, z);
      scene.add(g);

      trainersRef.current.push({
        group: g,
        player,
        paddleMesh: blade,
        baseY: y,
        initialX: x,
        initialZ: z,
        swingAnim: 0
      });
    }

    // Spawn Court 1 Players
    if (players[0]) spawnVoxelTrainer(players[0], -6.5 - 1.8, 0, 4.8, true);   // Player 1
    if (players[1]) spawnVoxelTrainer(players[1], -6.5 + 1.8, 0, 5.0, false);  // Player 2
    if (players[2]) spawnVoxelTrainer(players[2], -6.5 - 1.8, 0, -4.8, false); // Player 3
    if (players[3]) spawnVoxelTrainer(players[3], -6.5 + 1.8, 0, -5.0, false); // Player 4

    // Spawn Court 2 Players
    if (players.length >= 8) {
      if (players[4]) spawnVoxelTrainer(players[4], 6.5 - 1.8, 0, 4.8, true);   // Player 5
      if (players[5]) spawnVoxelTrainer(players[5], 6.5 + 1.8, 0, 5.0, false);  // Player 6
      if (players[6]) spawnVoxelTrainer(players[6], 6.5 - 1.8, 0, -4.8, false); // Player 7
      if (players[7]) spawnVoxelTrainer(players[7], 6.5 + 1.8, 0, -5.0, false); // Player 8
    }

    // Spawn Bench / Rotation Squad Players (resting on sideline bench)
    if (players.length >= 12) {
      if (players[8]) spawnVoxelTrainer(players[8], -2.4, 0, 9.4, false);  // Bench 1
      if (players[9]) spawnVoxelTrainer(players[9], -0.8, 0, 9.4, false);  // Bench 2
      if (players[10]) spawnVoxelTrainer(players[10], 0.8, 0, 9.4, false); // Bench 3
      if (players[11]) spawnVoxelTrainer(players[11], 2.4, 0, 9.4, false); // Bench 4
    }

    // Click / Pointer Raycasting for selecting trainer or court
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // 1. Check Trainers
      const trainerObjects = trainersRef.current.map((t) => t.group);
      const intersects = raycaster.intersectObjects(trainerObjects, true);

      if (intersects.length > 0) {
        let currentObj: THREE.Object3D | null = intersects[0].object;
        while (currentObj && !currentObj.name.startsWith('trainer_')) {
          currentObj = currentObj.parent;
        }

        if (currentObj && currentObj.userData && currentObj.userData.player) {
          const selectedP = currentObj.userData.player as Player;
          retroAudio.playSelect();
          onSelectPlayer(selectedP);
          return;
        }
      }

      // 2. Check Court Click
      const allCourts = scene.children.filter((c) => c.name.startsWith('court_'));
      const courtIntersects = raycaster.intersectObjects(allCourts, true);
      if (courtIntersects.length > 0) {
        let parentCourt: THREE.Object3D | null = courtIntersects[0].object;
        while (parentCourt && !parentCourt.name.startsWith('court_')) {
          parentCourt = parentCourt.parent;
        }
        if (parentCourt && parentCourt.userData && parentCourt.userData.courtId) {
          const cId = parentCourt.userData.courtId;
          retroAudio.playSelect();
          onSelectCourt(cId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // Window resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const asp = w / h;
      camera.left = -d * asp;
      camera.right = d * asp;
      camera.top = d;
      camera.bottom = -d;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 9. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Controls damping update
      controls.update();

      // Trainers Idle Bobbing + Swing Animation
      trainersRef.current.forEach((t, index) => {
        // Subtle idle bobbing like in Pokémon battle arena
        t.group.position.y = t.baseY + Math.sin(elapsed * 4 + index) * 0.04;

        // Billboards rotate slightly to face camera angle
        const badge = t.group.children.find((c) => c instanceof THREE.Mesh && c.position.y > 2);
        if (badge) {
          badge.quaternion.copy(camera.quaternion);
        }

        // Swing animation decay
        if (t.swingAnim > 0) {
          t.swingAnim = Math.max(0, t.swingAnim - delta * 4);
          t.paddleMesh.rotation.x = Math.sin(t.swingAnim * Math.PI) * 0.8;
        }
      });

      // Ball Physics & Rally Arc (Court 1 focus, responds to activeCourtId)
      const bState = ballStateRef.current;
      const courtCenter = activeCourtId === 1 ? -6.5 : 6.5;
      bState.courtX = courtCenter;

      if (bState.mesh && bState.shadow && isRallyActive) {
        bState.t += delta * bState.speed;

        if (bState.t >= 1.0) {
          // Ball bounced / reached player
          bState.t = 0;
          bState.direction *= -1; // reverse direction

          // Trigger 8-bit sound
          retroAudio.playBounce();
          if (onBallHit) onBallHit();

          // Trigger nearest player paddle swing!
          const hittingPlayers = trainersRef.current.filter(
            (t) => t.player.courtId === activeCourtId && (bState.direction > 0 ? t.player.side === 'B' : t.player.side === 'A')
          );
          if (hittingPlayers.length > 0) {
            const randomHitter = hittingPlayers[Math.floor(Math.random() * hittingPlayers.length)];
            randomHitter.swingAnim = 1.0;
          }

          // Spawn small pixel bounce dust
          createBounceParticle(bState.mesh.position.x, 0.1, bState.mesh.position.z);
        }

        // Trajectory interpolation
        const currentZ = bState.direction > 0
          ? -4.8 + bState.t * 9.6 // Moving B -> A
          : 4.8 - bState.t * 9.6;  // Moving A -> B

        // Parabola bounce height
        const height = Math.sin(bState.t * Math.PI) * bState.peakHeight + 0.18;

        bState.mesh.position.set(bState.courtX + Math.sin(bState.t * Math.PI * 2) * 0.35, height, currentZ);
        bState.mesh.rotation.x += delta * 6;
        bState.mesh.rotation.y += delta * 8;

        // Shadow follows on ground
        bState.shadow.position.set(bState.mesh.position.x, 0.06, currentZ);
        const shadowScale = Math.max(0.2, 1.0 - height * 0.25);
        bState.shadow.scale.set(shadowScale, shadowScale, shadowScale);
      }

      // Update bounce particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.position.y += delta * 0.8;
        p.scale.multiplyScalar(0.92);
        if (p.scale.x < 0.05) {
          scene.remove(p);
          particlesRef.current.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    function createBounceParticle(x: number, y: number, z: number) {
      const pGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const pMat = new THREE.MeshBasicMaterial({ color: 0xB8F23A });
      const p = new THREE.Mesh(pGeo, pMat);
      p.position.set(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
      scene.add(p);
      particlesRef.current.push(p);
    }

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Handle Court Highlight change
  useEffect(() => {
    Object.entries(courtHighlightsRef.current).forEach(([cId, mesh]) => {
      const courtMesh = mesh as THREE.Mesh;
      if (courtMesh && courtMesh.material) {
        const isSelected = Number(cId) === activeCourtId;
        const mat = courtMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = isSelected ? 0.95 : 0.15;
        mat.color.setHex(isSelected ? 0xB8F23A : 0xffffff);
      }
    });
  }, [activeCourtId]);

  // Handle Lighting Preset change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !lightsRef.current.ambient || !lightsRef.current.dir) return;

    if (lightingMode === 'day') {
      scene.background = new THREE.Color(0x0a1410);
      scene.fog = new THREE.FogExp2(0x0a1410, 0.018);
      lightsRef.current.ambient.color.setHex(0xFDE68A);
      lightsRef.current.ambient.groundColor.setHex(0x166534);
      lightsRef.current.ambient.intensity = 0.85;
      lightsRef.current.dir.color.setHex(0xffffff);
      lightsRef.current.dir.intensity = 1.25;
      if (lightsRef.current.pointGym) lightsRef.current.pointGym.color.setHex(0xB8F23A);
    } else if (lightingMode === 'sunset') {
      scene.background = new THREE.Color(0x1a0f1e);
      scene.fog = new THREE.FogExp2(0x1a0f1e, 0.022);
      lightsRef.current.ambient.color.setHex(0xFDBA74);
      lightsRef.current.ambient.groundColor.setHex(0x701A75);
      lightsRef.current.ambient.intensity = 0.9;
      lightsRef.current.dir.color.setHex(0xFF7043);
      lightsRef.current.dir.intensity = 1.4;
      if (lightsRef.current.pointGym) lightsRef.current.pointGym.color.setHex(0xF43F5E);
    } else if (lightingMode === 'night_cyber') {
      scene.background = new THREE.Color(0x030712);
      scene.fog = new THREE.FogExp2(0x030712, 0.025);
      lightsRef.current.ambient.color.setHex(0x38BDF8);
      lightsRef.current.ambient.groundColor.setHex(0x022C22);
      lightsRef.current.ambient.intensity = 0.6;
      lightsRef.current.dir.color.setHex(0x38BDF8);
      lightsRef.current.dir.intensity = 0.8;
      if (lightsRef.current.pointGym) lightsRef.current.pointGym.color.setHex(0x00FF88);
    }
  }, [lightingMode]);

  // Handle Camera Presets
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (cameraPreset === 'isometric') {
      camera.position.set(22, 18, 22);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      camera.zoom = 1.0;
    } else if (cameraPreset === 'topdown') {
      camera.position.set(0, 32, 0.1);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      camera.zoom = 1.25;
    } else if (cameraPreset === 'action') {
      const courtX = activeCourtId === 1 ? -6.5 : 6.5;
      camera.position.set(courtX + 8, 8, 14);
      camera.lookAt(courtX, 0.5, 0);
      controls.target.set(courtX, 0.5, 0);
      camera.zoom = 1.5;
    }
    camera.updateProjectionMatrix();
    controls.update();
  }, [cameraPreset, activeCourtId]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 3D WebGL Canvas */}
      <div id="canvas-container" ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Retro 2.5D Overlay Hint & Action Controls */}
      <div className="absolute top-20 left-4 pointer-events-none hidden sm:block">
        <div className="glass-pill px-3 py-1.5 rounded-full text-xs text-white/70 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#B8F23A] animate-ping" />
          <span>ลากเพื่อหมุนมุมมอง • คลิกที่ผู้เล่นเพื่อเปิดการ์ดโปเกบอล</span>
        </div>
      </div>

      {/* Floating Action Trigger on Bottom Left: Super Smash / Rally Toggle */}
      <div className="absolute bottom-6 left-4 z-20 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            retroAudio.playSmash();
            onToggleRally();
          }}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg ${
            isRallyActive
              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30'
              : 'bg-[#B8F23A] text-[#111827] hover:brightness-110'
          }`}
        >
          <span>{isRallyActive ? '⏸️' : '▶️'}</span>
          <span className="font-pixel text-[9px]">{isRallyActive ? 'PAUSE RALLY' : 'START RALLY'}</span>
        </button>

        <button
          onClick={() => {
            retroAudio.playSmash();
            const b = ballStateRef.current;
            b.speed = 2.4;
            b.peakHeight = 3.2;
            setTimeout(() => {
              b.speed = 0.85;
              b.peakHeight = 2.2;
            }, 1800);
          }}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/40 hover:bg-rose-500/30 transition shadow-lg flex items-center gap-1.5"
        >
          <span>⚡</span>
          <span className="font-pixel text-[9px]">SUPER SMASH!</span>
        </button>

        {/* Current Court Switcher Pill */}
        <div className="flex items-center rounded-xl bg-slate-900/80 border border-white/10 p-1 text-xs">
          <button
            onClick={() => {
              retroAudio.playSelect();
              onSelectCourt(1);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
              activeCourtId === 1 ? 'bg-[#B8F23A] text-[#111827]' : 'text-white/60 hover:text-white'
            }`}
          >
            คอร์ต 1
          </button>
          <button
            onClick={() => {
              retroAudio.playSelect();
              onSelectCourt(2);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
              activeCourtId === 2 ? 'bg-[#B8F23A] text-[#111827]' : 'text-white/60 hover:text-white'
            }`}
          >
            คอร์ต 2
          </button>
        </div>
      </div>
    </div>
  );
};
