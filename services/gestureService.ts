import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";

export class GestureService {
  private handLandmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;
  private isInitializing = false;
  
  // State smoothing - Increased Alpha for higher sensitivity (Low latency)
  private lastOpenness = 0.5; 
  private lastX = 0.5;
  private lastY = 0.5;

  constructor() {}

  async initialize(): Promise<void> {
    if (this.isInitializing || this.handLandmarker) return;
    this.isInitializing = true;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
      );
      
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      await this.setupCamera();
    } catch (e) {
      console.warn("GestureService initialization failed:", e);
    } finally {
      this.isInitializing = false;
    }
  }

  private async setupCamera() {
    const videoElement = document.createElement("video");
    videoElement.setAttribute("playsinline", "");
    videoElement.style.transform = "scaleX(-1)"; 
    this.video = videoElement;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, frameRate: { ideal: 60 } }
      });
      this.video.srcObject = stream;
      
      await new Promise<void>((resolve, reject) => {
          const v = this.video!;
          v.onloadedmetadata = () => {
              const checkDims = () => {
                  if (v.videoWidth > 0 && v.videoHeight > 0) {
                      v.play().then(() => resolve()).catch(e => resolve()); 
                  } else {
                      setTimeout(checkDims, 50);
                  }
              };
              checkDims();
          };
      });
    } catch (e) {
      this.video = null;
      throw e; 
    }
  }

  public detect(): { isDetected: boolean, openness: number, x: number, y: number } {
    if (!this.handLandmarker || !this.video) return this.fallback();
    const v = this.video;
    if (v.paused || v.ended || v.readyState < 2 || v.videoWidth < 1) return this.fallback();

    let result: HandLandmarkerResult | null = null;
    try {
        if (v.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = v.currentTime;
            result = this.handLandmarker.detectForVideo(v, performance.now());
        }
    } catch(e) { return this.fallback(); }

    if (!result || !result.landmarks || result.landmarks.length === 0) return this.fallback();

    const landmarks = result.landmarks[0];
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    
    if (!wrist || !middleMcp) return this.fallback();

    // 1. Position - High sensitivity
    const rawX = 1.0 - wrist.x; 
    const rawY = wrist.y;
    
    // Alpha 0.4 = Very responsive (40% new data per frame)
    const alphaPos = 0.4;
    this.lastX += (rawX - this.lastX) * alphaPos;
    this.lastY += (rawY - this.lastY) * alphaPos;

    // 2. Openness Logic
    const palmSize = Math.sqrt(
        Math.pow(middleMcp.x - wrist.x, 2) + 
        Math.pow(middleMcp.y - wrist.y, 2) + 
        Math.pow(middleMcp.z - wrist.z, 2)
    );

    if (palmSize < 0.001) return { isDetected: true, openness: this.lastOpenness, x: this.lastX, y: this.lastY };

    let totalTipDist = 0;
    const tips = [4, 8, 12, 16, 20];
    let valid = 0;
    for (let idx of tips) {
        if (landmarks[idx]) {
            totalTipDist += Math.sqrt(
                Math.pow(landmarks[idx].x - wrist.x, 2) + 
                Math.pow(landmarks[idx].y - wrist.y, 2) + 
                Math.pow(landmarks[idx].z - wrist.z, 2)
            );
            valid++;
        }
    }
    
    const avgTipDist = valid > 0 ? totalTipDist / valid : 0;
    const ratio = avgTipDist / palmSize;

    // Calibrated Ratio for "Snappy" Zoom
    // 0.8 is a tight fist, 1.8 is a fully extended hand
    const minR = 0.7;
    const maxR = 1.8;
    
    let rawOpen = (ratio - minR) / (maxR - minR);
    rawOpen = Math.max(0, Math.min(1, rawOpen));

    // Non-linear curve for better control feel
    // rawOpen = Math.pow(rawOpen, 1.5); 

    const alphaOpen = 0.3; // High responsiveness for zoom
    this.lastOpenness += (rawOpen - this.lastOpenness) * alphaOpen;

    return { 
        isDetected: true, 
        openness: this.lastOpenness,
        x: this.lastX,
        y: this.lastY
    };
  }

  private fallback() {
    // If no hand, drift back to center slowly
    this.lastX += (0.5 - this.lastX) * 0.05;
    this.lastY += (0.5 - this.lastY) * 0.05;
    return { isDetected: false, openness: this.lastOpenness, x: this.lastX, y: this.lastY };
  }
}