import * as THREE from 'three';

export interface SimulationState {
  fps: number;
  particleCount: number;
  interactionFactor: number; // 0.0 to 1.0
  isHandDetected: boolean;
  status: 'INITIALIZING' | 'RUNNING' | 'ERROR';
}

export interface CurvePathData {
  points: THREE.Vector3[];
  length: number;
}

export interface JunctionLane {
    id: string;
    fromLane: string;
    toLane: string;
    path: THREE.CurvePath<THREE.Vector3>;
}