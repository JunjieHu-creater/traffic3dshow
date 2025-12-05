import React, { useState } from 'react';
import TrafficScene from './components/TrafficScene';
import HUD from './components/HUD';
import { SimulationState } from './types';

const App: React.FC = () => {
  const [simState, setSimState] = useState<SimulationState>({
    fps: 0,
    particleCount: 0,
    interactionFactor: 0.5,
    isHandDetected: false,
    status: 'INITIALIZING'
  });

  const updateState = (newState: Partial<SimulationState>) => {
    setSimState(prev => ({ ...prev, ...newState }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-100">
      <TrafficScene onUpdateState={updateState} />
      <HUD state={simState} />
    </div>
  );
};

export default App;