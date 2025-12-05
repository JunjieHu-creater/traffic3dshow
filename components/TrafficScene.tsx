import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GestureService } from '../services/gestureService';
import { SimulationState } from '../types';

// ==========================================
// 1. SCIENTIFIC CONFIGURATION
// ==========================================
const PHYSICS_HZ = 60; 
const PHYSICS_DT = 1 / PHYSICS_HZ;

// Grid & Geometry
const GRID_SIZE = 3;        
const BLOCK_SIZE = 160;     
const ROAD_WIDTH = 12; // Slightly wider for professional look
const LANE_OFFSET = 3.0; 

// Traffic Flow Parameters - OPTIMIZED FOR OBSERVATION
const CAR_COUNT = 500;       
const CAR_LENGTH = 4.6;
const MIN_GAP = 2.0; 

// IDM (Intelligent Driver Model) - Slowed down for visual clarity
const IDM_V0 = 14.0;  // 50 km/h (Urban Limit)
const IDM_T = 1.6;    // Increased safety gap (1.6s)
const IDM_A = 1.5;    // Gentle acceleration
const IDM_B = 2.5;    // Smooth braking
const IDM_S0 = 3.0;   // Jam distance

const THEME = {
  BG: 0xf1f5f9, 
  ROAD: 0xffffff,
  MARKING: 0xcbd5e1, 
  BUILDING: 0xe2e8f0, 
  CAR_FLOW: 0x3b82f6, 
  CAR_BRAKE: 0xf43f5e, 
  CAR_ACCEL: 0x10b981, 
  LIGHT_RED: 0xf43f5e,
  LIGHT_GREEN: 0x10b981,
  LIGHT_AMBER: 0xf59e0b
};

// ==========================================
// 2. DATA MODELS
// ==========================================

type LaneType = 'ROAD' | 'JUNCTION';

interface Lane {
    id: string;
    type: LaneType;
    path: THREE.CurvePath<THREE.Vector3>;
    len: number;
    nextLanes: string[]; 
    prevLanes: string[]; 
    toNodeId?: string;   
    direction?: 'NS' | 'EW'; 
}

interface Car {
    id: number;
    active: boolean;
    laneId: string;
    t: number;       
    v: number;       
    a: number;       
    color: THREE.Color;
    targetLaneId: string | null; 
}

interface TrafficLight {
    nodeId: string;
    // 0=NS Green, 1=NS Yellow, 2=All Red, 3=EW Green, 4=EW Yellow, 5=All Red
    phase: number;
    timer: number;
    meshNS: THREE.Mesh;
    meshEW: THREE.Mesh;
}

const TrafficScene: React.FC<{ onUpdateState: (s: Partial<SimulationState>) => void }> = ({ onUpdateState }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureService = useRef(new GestureService());
  const requestRef = useRef<number>(0);

  // Simulation Data
  const lanesRef = useRef<Map<string, Lane>>(new Map());
  const carsRef = useRef<Car[]>([]);
  const lightsRef = useRef<Map<string, TrafficLight>>(new Map());
  
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  
  // ==========================================
  // 3. NETWORK GENERATION
  // ==========================================
  const buildNetwork = (scene: THREE.Scene) => {
      const cityGroup = new THREE.Group();
      
      const getNodePos = (x: number, y: number) => 
        new THREE.Vector3((x-1)*BLOCK_SIZE, 0, (y-1)*BLOCK_SIZE);

      // A. Nodes & Context
      for(let x=0; x<GRID_SIZE; x++) {
          for(let z=0; z<GRID_SIZE; z++) {
              const nodeId = `${x}_${z}`;
              const pos = getNodePos(x, z);
              
              // Intersection Plate
              const w = ROAD_WIDTH * 2.2;
              const geo = new THREE.BoxGeometry(w, 0.2, w);
              const mat = new THREE.MeshStandardMaterial({ color: THEME.ROAD, roughness: 0.9 });
              const mesh = new THREE.Mesh(geo, mat);
              mesh.position.copy(pos);
              mesh.receiveShadow = true;
              cityGroup.add(mesh);

              // Building Blocks (Abstract)
              if (x < GRID_SIZE && z < GRID_SIZE) {
                // Add corner buildings
                const bH = 10 + Math.random() * 30;
                const bGeo = new THREE.BoxGeometry(20, bH, 20);
                const bMat = new THREE.MeshStandardMaterial({ color: THEME.BUILDING });
                const b = new THREE.Mesh(bGeo, bMat);
                b.position.copy(pos).add(new THREE.Vector3(BLOCK_SIZE/2, bH/2, BLOCK_SIZE/2));
                b.castShadow = true;
                b.receiveShadow = true;
                // Only add some to avoid clutter
                if (Math.random() > 0.3) cityGroup.add(b);
              }

              // Traffic Lights Geometry
              const poleH = 14;
              const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, poleH);
              const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
              const pole = new THREE.Mesh(poleGeo, poleMat);
              pole.position.copy(pos).add(new THREE.Vector3(ROAD_WIDTH + 2, poleH/2, ROAD_WIDTH + 2));
              cityGroup.add(pole);

              // Signal Heads
              const headGeo = new THREE.BoxGeometry(2.5, 1, 1);
              const matNS = new THREE.MeshBasicMaterial({ color: THEME.LIGHT_RED });
              const lightNS = new THREE.Mesh(headGeo, matNS);
              lightNS.position.copy(pos).add(new THREE.Vector3(ROAD_WIDTH + 2, poleH, ROAD_WIDTH + 2));
              lightNS.rotation.y = 0;
              cityGroup.add(lightNS);

              const matEW = new THREE.MeshBasicMaterial({ color: THEME.LIGHT_GREEN });
              const lightEW = new THREE.Mesh(headGeo, matEW);
              lightEW.position.copy(pos).add(new THREE.Vector3(ROAD_WIDTH + 2, poleH-2, ROAD_WIDTH + 2));
              lightEW.rotation.y = Math.PI/2;
              cityGroup.add(lightEW);

              lightsRef.current.set(nodeId, {
                  nodeId,
                  phase: Math.floor(Math.random() * 6),
                  timer: Math.random() * 10,
                  meshNS: lightNS,
                  meshEW: lightEW
              });
          }
      }

      // B. Roads
      const addRoadLane = (p1: THREE.Vector3, p2: THREE.Vector3, id: string, toNode: string, dir: 'NS' | 'EW') => {
          const curve = new THREE.LineCurve3(p1, p2);
          const len = curve.getLength();
          
          // Road Bed
          const shape = new THREE.Shape();
          shape.moveTo(-ROAD_WIDTH/2, 0);
          shape.lineTo(ROAD_WIDTH/2, 0);
          shape.lineTo(ROAD_WIDTH/2, len);
          shape.lineTo(-ROAD_WIDTH/2, len);
          const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
          const mat = new THREE.MeshStandardMaterial({ color: THEME.ROAD, roughness: 0.8 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(p1);
          mesh.lookAt(p2);
          mesh.rotateX(Math.PI/2);
          mesh.receiveShadow = true;
          cityGroup.add(mesh);

          // Markings
          const dashGeo = new THREE.PlaneGeometry(0.6, len * 0.9);
          const dashMat = new THREE.MeshBasicMaterial({ color: THEME.MARKING });
          const line = new THREE.Mesh(dashGeo, dashMat);
          line.position.copy(p1).lerp(p2, 0.5);
          line.position.y = 0.15;
          line.lookAt(p2);
          line.rotateX(-Math.PI/2);
          cityGroup.add(line);

          lanesRef.current.set(id, {
              id,
              type: 'ROAD',
              path: curve,
              len,
              nextLanes: [],
              prevLanes: [],
              toNodeId: toNode,
              direction: dir
          });
      };

      for(let x=0; x<GRID_SIZE; x++) {
        for(let z=0; z<GRID_SIZE; z++) {
            const curr = getNodePos(x, z);
            const nodeId = `${x}_${z}`;

            if (x < GRID_SIZE - 1) {
                const next = getNodePos(x+1, z);
                const nextNodeId = `${x+1}_${z}`;
                const s1 = curr.clone().add(new THREE.Vector3(ROAD_WIDTH, 0, LANE_OFFSET));
                const e1 = next.clone().add(new THREE.Vector3(-ROAD_WIDTH, 0, LANE_OFFSET));
                addRoadLane(s1, e1, `R_${nodeId}_${nextNodeId}`, nextNodeId, 'EW');

                const s2 = next.clone().add(new THREE.Vector3(-ROAD_WIDTH, 0, -LANE_OFFSET));
                const e2 = curr.clone().add(new THREE.Vector3(ROAD_WIDTH, 0, -LANE_OFFSET));
                addRoadLane(s2, e2, `R_${nextNodeId}_${nodeId}`, nodeId, 'EW');
            }
            if (z < GRID_SIZE - 1) {
                const next = getNodePos(x, z+1);
                const nextNodeId = `${x}_${z+1}`;
                const s1 = curr.clone().add(new THREE.Vector3(-LANE_OFFSET, 0, ROAD_WIDTH));
                const e1 = next.clone().add(new THREE.Vector3(-LANE_OFFSET, 0, -ROAD_WIDTH));
                addRoadLane(s1, e1, `R_${nodeId}_${nextNodeId}`, nextNodeId, 'NS');

                const s2 = next.clone().add(new THREE.Vector3(LANE_OFFSET, 0, -ROAD_WIDTH));
                const e2 = curr.clone().add(new THREE.Vector3(LANE_OFFSET, 0, ROAD_WIDTH));
                addRoadLane(s2, e2, `R_${nextNodeId}_${nodeId}`, nodeId, 'NS');
            }
        }
      }

      // C. Junctions
      Array.from(lanesRef.current.values()).forEach(inLane => {
          if (inLane.type !== 'ROAD') return;
          Array.from(lanesRef.current.values()).forEach(outLane => {
              if (outLane.type !== 'ROAD') return;
              if (outLane.id.startsWith(`R_${inLane.toNodeId}_`)) {
                  const inDir = inLane.path.getTangent(1);
                  const outDir = outLane.path.getTangent(0);
                  const angle = inDir.angleTo(outDir); 

                  if (angle > Math.PI * 0.8) return; 

                  const p1 = inLane.path.getPoint(1);
                  const p2 = outLane.path.getPoint(0);
                  const control = p1.clone().add(inDir.clone().multiplyScalar(ROAD_WIDTH * 1.5)); 
                  
                  const curve = new THREE.QuadraticBezierCurve3(p1, control, p2);
                  const jId = `J_${inLane.id}_${outLane.id}`;
                  
                  lanesRef.current.set(jId, {
                      id: jId,
                      type: 'JUNCTION',
                      path: curve,
                      len: curve.getLength(),
                      nextLanes: [outLane.id],
                      prevLanes: [inLane.id]
                  });
                  inLane.nextLanes.push(jId);
              }
          });
      });

      scene.add(cityGroup);
  };

  // ==========================================
  // 4. TRAFFIC LOGIC (Slower, Smooth IDM)
  // ==========================================
  
  const initCars = () => {
      const startLanes = Array.from(lanesRef.current.values()).filter(l => l.type === 'ROAD');
      
      for(let i=0; i<CAR_COUNT; i++) {
          const lane = startLanes[Math.floor(Math.random() * startLanes.length)];
          carsRef.current.push({
              id: i,
              active: true,
              laneId: lane.id,
              t: Math.random() * lane.len * 0.9,
              v: IDM_V0 * 0.5,
              a: 0,
              color: new THREE.Color(),
              targetLaneId: null
          });
      }
  };

  const updateTrafficLights = (dt: number) => {
      const T_GREEN = 10;
      const T_YELLOW = 4;
      const T_RED_CLEAR = 2;
      const CYCLE = (T_GREEN + T_YELLOW + T_RED_CLEAR) * 2;

      lightsRef.current.forEach(light => {
          light.timer += dt;
          const t = light.timer % CYCLE;
          
          let ns: number = THEME.LIGHT_RED;
          let ew: number = THEME.LIGHT_RED;

          if (t < T_GREEN) {
              ns = THEME.LIGHT_GREEN; ew = THEME.LIGHT_RED;
          } else if (t < T_GREEN + T_YELLOW) {
              ns = THEME.LIGHT_AMBER; ew = THEME.LIGHT_RED;
          } else if (t < T_GREEN + T_YELLOW + T_RED_CLEAR) {
              ns = THEME.LIGHT_RED; ew = THEME.LIGHT_RED;
          } else if (t < T_GREEN + T_YELLOW + T_RED_CLEAR + T_GREEN) {
              ns = THEME.LIGHT_RED; ew = THEME.LIGHT_GREEN;
          } else if (t < T_GREEN + T_YELLOW + T_RED_CLEAR + T_GREEN + T_YELLOW) {
              ns = THEME.LIGHT_RED; ew = THEME.LIGHT_AMBER;
          }

          (light.meshNS.material as THREE.MeshBasicMaterial).color.setHex(ns);
          (light.meshEW.material as THREE.MeshBasicMaterial).color.setHex(ew);
      });
  };

  const getTrafficLightState = (lane: Lane): 'GREEN' | 'YELLOW' | 'RED' => {
      if (lane.type !== 'ROAD' || !lane.toNodeId || !lane.direction) return 'GREEN';
      const light = lightsRef.current.get(lane.toNodeId);
      if (!light) return 'GREEN';
      const mat = (lane.direction === 'NS' ? light.meshNS : light.meshEW).material as THREE.MeshBasicMaterial;
      const col = mat.color.getHex();
      if (col === THEME.LIGHT_GREEN) return 'GREEN';
      if (col === THEME.LIGHT_AMBER) return 'YELLOW';
      return 'RED';
  };

  const updatePhysics = (dt: number) => {
      updateTrafficLights(dt);

      const lanes = lanesRef.current;
      const carsByLane: Map<string, Car[]> = new Map();
      carsRef.current.forEach(c => {
          if (!carsByLane.has(c.laneId)) carsByLane.set(c.laneId, []);
          carsByLane.get(c.laneId)!.push(c);
      });
      carsByLane.forEach(list => list.sort((a,b) => b.t - a.t));

      carsRef.current.forEach(car => {
          const currentLane = lanes.get(car.laneId)!;
          const lanePeers = carsByLane.get(car.laneId) || [];
          const idx = lanePeers.indexOf(car);
          const leader = (idx > 0) ? lanePeers[idx - 1] : null;

          let gap = 500;
          let dv = 0;

          if (leader) {
              gap = leader.t - car.t - CAR_LENGTH;
              dv = car.v - leader.v;
          } else {
              const distToEnd = currentLane.len - car.t;
              if (currentLane.type === 'ROAD') {
                  const signal = getTrafficLightState(currentLane);
                  if (signal === 'RED' || signal === 'YELLOW') {
                      gap = distToEnd - 2.0;
                      dv = car.v;
                  } else {
                      // Green light lookahead
                      if (!car.targetLaneId && currentLane.nextLanes.length > 0) {
                          const rnd = Math.floor(Math.random() * currentLane.nextLanes.length);
                          car.targetLaneId = currentLane.nextLanes[rnd];
                      }
                      if (car.targetLaneId) {
                          const nextLaneCars = carsByLane.get(car.targetLaneId);
                          if (nextLaneCars && nextLaneCars.length > 0) {
                              const lastCar = nextLaneCars[nextLaneCars.length - 1];
                              const virtualGap = distToEnd + lastCar.t - CAR_LENGTH;
                              if (virtualGap < 50) {
                                  gap = virtualGap;
                                  dv = car.v - lastCar.v;
                              }
                          }
                      }
                  }
              } else {
                  // Junction -> Road
                  if (!car.targetLaneId && currentLane.nextLanes.length > 0) 
                      car.targetLaneId = currentLane.nextLanes[0];
                  
                  if (car.targetLaneId) {
                       const nextLaneCars = carsByLane.get(car.targetLaneId);
                       if (nextLaneCars && nextLaneCars.length > 0) {
                          const lastCar = nextLaneCars[nextLaneCars.length - 1];
                          const virtualGap = distToEnd + lastCar.t - CAR_LENGTH;
                          gap = virtualGap;
                          dv = car.v - lastCar.v;
                       }
                  }
              }
          }

          const s_star = IDM_S0 + Math.max(0, car.v * IDM_T + (car.v * dv)/(2 * Math.sqrt(IDM_A * IDM_B)));
          let acc = IDM_A * (1 - Math.pow(car.v / IDM_V0, 4) - Math.pow(s_star / Math.max(0.1, gap), 2));
          
          if (gap < MIN_GAP) {
              acc = -IDM_B * 4; 
              car.v = 0;
          }
          car.a = acc;
      });

      carsRef.current.forEach(car => {
          if (car.v === 0 && car.a < 0) car.a = 0;
          car.v += car.a * dt;
          car.v = Math.max(0, car.v);
          car.t += car.v * dt;

          const lane = lanes.get(car.laneId)!;
          if (car.t >= lane.len) {
              if (car.targetLaneId) {
                  car.t -= lane.len;
                  car.laneId = car.targetLaneId;
                  car.targetLaneId = null; 
              } else {
                  car.t = 0;
                  const keys = Array.from(lanes.keys()).filter(k => k.startsWith('R_'));
                  car.laneId = keys[Math.floor(Math.random() * keys.length)];
              }
          }

          if (car.a < -0.5) car.color.setHex(THEME.CAR_BRAKE);
          else if (car.v < IDM_V0 * 0.3) car.color.setHex(THEME.CAR_ACCEL);
          else car.color.setHex(THEME.CAR_FLOW);
      });
  };

  const renderParticles = () => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const dummy = new THREE.Object3D();
      const lanes = lanesRef.current;

      carsRef.current.forEach((car, i) => {
          const lane = lanes.get(car.laneId);
          if (!lane) return;

          const u = Math.max(0, Math.min(0.999, car.t / lane.len));
          const pos = lane.path.getPointAt(u);
          const tan = lane.path.getTangentAt(u);

          dummy.position.copy(pos);
          dummy.position.y = 0.5;
          dummy.lookAt(pos.clone().add(tan));
          
          // Smoother scaling
          const scaleZ = 1.0 + (car.v * 0.04);
          dummy.scale.set(1, 1, scaleZ);

          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, car.color);
      });
      
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  useEffect(() => {
    if (!containerRef.current) return;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THEME.BG);
    scene.fog = new THREE.Fog(THEME.BG, 300, 1200);

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 1, 3000);
    camera.position.set(0, 500, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(200, 400, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -500; sun.shadow.camera.right = 500;
    sun.shadow.camera.top = 500; sun.shadow.camera.bottom = -500;
    scene.add(sun);

    buildNetwork(scene);
    
    const geometry = new THREE.CapsuleGeometry(0.7, 1.8, 4, 8);
    geometry.rotateX(Math.PI/2);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.2, metalness: 0.5
    });
    meshRef.current = new THREE.InstancedMesh(geometry, material, CAR_COUNT);
    meshRef.current.frustumCulled = false;
    scene.add(meshRef.current);
    
    initCars();
    gestureService.current.initialize();

    let lastTime = performance.now();
    let accumulator = 0;

    const animate = () => {
        requestRef.current = requestAnimationFrame(animate);
        const now = performance.now();
        const frameTime = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        const gesture = gestureService.current.detect();
        onUpdateState({
            fps: Math.round(1/frameTime),
            particleCount: CAR_COUNT,
            interactionFactor: gesture.openness,
            isHandDetected: gesture.isDetected
        });

        // Professional Camera Control
        // Mapping: Open Hand (1.0) -> Close up view (Zoom In)
        //          Fist (0.0) -> High Altitude view (Zoom Out)
        const openness = gesture.isDetected ? gesture.openness : 0.5;
        
        // Target Height: 80 (Close) to 600 (Far)
        const hMin = 80; 
        const hMax = 600;
        const targetH = hMax - (openness * (hMax - hMin)); 
        
        // Target Radius: 100 (Close) to 600 (Far)
        const rMin = 100;
        const rMax = 600;
        const targetR = rMax - (openness * (rMax - rMin));

        // Rotation X-Axis control
        // Center (0.5) is stationary. Left spins one way, Right spins other.
        const rotSpeed = gesture.isDetected ? (gesture.x - 0.5) * 2.0 : 0.05;
        const theta = now * 0.0002 + rotSpeed;

        // Smooth Lerp Camera
        const camAlpha = 0.08;
        const cx = Math.sin(theta) * targetR;
        const cz = Math.cos(theta) * targetR;
        
        camera.position.x += (cx - camera.position.x) * camAlpha;
        camera.position.z += (cz - camera.position.z) * camAlpha;
        camera.position.y += (targetH - camera.position.y) * camAlpha;
        camera.lookAt(0, 0, 0);

        accumulator += frameTime;
        while (accumulator >= PHYSICS_DT) {
            updatePhysics(PHYSICS_DT);
            accumulator -= PHYSICS_DT;
        }

        renderParticles();
        renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        cancelAnimationFrame(requestRef.current);
        window.removeEventListener('resize', handleResize);
        if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default TrafficScene;