import React from 'react';
import { SimulationState } from '../types';

interface HUDProps {
  state: SimulationState;
}

const HUD: React.FC<HUDProps> = ({ state }) => {
  const { fps, particleCount, isHandDetected, interactionFactor } = state;

  return (
    <div className="absolute inset-0 pointer-events-none select-none font-sans text-slate-800">
      
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-4">
           <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center text-white font-bold text-xs tracking-wider">NF</div>
           <div>
             <h1 className="text-sm font-bold text-slate-900 tracking-tight">NEUROFLOW <span className="text-slate-400 font-normal">PROFESSIONAL</span></h1>
           </div>
        </div>
        <div className="flex gap-6 text-xs font-mono text-slate-500">
           <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/>
              <span>SERVER: ONLINE</span>
           </div>
           <div>LATENCY: 4ms</div>
           <div>PACKETS: {particleCount * 4}/s</div>
        </div>
      </div>

      {/* Left Sidebar - Data Panel */}
      <div className="absolute top-14 left-0 bottom-0 w-64 bg-white/80 backdrop-blur-md border-r border-slate-200 p-4 flex flex-col gap-4">
          
          {/* Section 1: Camera */}
          <div className="bg-white/50 border border-slate-200 rounded-lg p-3">
              <h2 className="text-[10px] font-bold text-slate-400 mb-2 tracking-widest">CONTROL LINK</h2>
              <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">STATUS</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isHandDetected ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                      {isHandDetected ? 'CONNECTED' : 'SEARCHING'}
                  </span>
              </div>
              <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-slate-500">
                      <span>ZOOM</span>
                      <span>{(interactionFactor * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-75" style={{width: `${interactionFactor * 100}%`}} />
                  </div>
              </div>
          </div>

          {/* Section 2: Traffic Stats */}
          <div className="bg-white/50 border border-slate-200 rounded-lg p-3 flex-1">
              <h2 className="text-[10px] font-bold text-slate-400 mb-3 tracking-widest">NETWORK METRICS</h2>
              <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <div className="text-[10px] text-slate-400">VEHICLES</div>
                      <div className="text-xl font-light text-slate-900">{particleCount}</div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <div className="text-[10px] text-slate-400">FPS</div>
                      <div className="text-xl font-light text-slate-900">{fps}</div>
                  </div>
              </div>
              
              <div className="space-y-3">
                  <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                          <span>AVG SPEED</span>
                          <span>42 km/h</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full w-[60%]" />
                      </div>
                  </div>
                  <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                          <span>DENSITY</span>
                          <span>18 veh/km</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                          <div className="bg-amber-500 h-full w-[35%]" />
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Bottom Bar - Timeline */}
      <div className="absolute bottom-0 left-64 right-0 h-12 bg-white/90 backdrop-blur-md border-t border-slate-200 flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
              <button className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center text-white">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <div className="h-1 w-64 bg-slate-200 rounded-full relative">
                   <div className="absolute top-0 left-0 h-full bg-slate-400 w-1/3 rounded-full"/>
              </div>
              <span className="text-xs font-mono text-slate-500">14:02:45 / 24:00:00</span>
          </div>
          <div className="flex gap-2 text-[10px] font-bold text-slate-400">
              <span className="px-2 py-1 bg-slate-100 rounded">VISSIM COMPATIBLE</span>
              <span className="px-2 py-1 bg-slate-100 rounded">HD MAP</span>
          </div>
      </div>

      {/* Center Reticle */}
      <div className="absolute top-1/2 left-[calc(50%+8rem)] -translate-x-1/2 -translate-y-1/2 w-12 h-12 border border-slate-400/20 rounded-full flex items-center justify-center pointer-events-none">
          <div className="w-1 h-1 bg-slate-400/50 rounded-full" />
      </div>

    </div>
  );
};

export default HUD;