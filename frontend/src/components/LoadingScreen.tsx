"use client";

import { useEffect, useState } from "react";

interface LoadingScreenProps {
  progress: number;
  statusText: string;
  onComplete: () => void;
  isAudioPlaying?: boolean;
  onToggleAudio?: () => void;
  currentTrackName?: string;
  onSwitchTrack?: () => void;
}

export default function LoadingScreen({
  progress,
  statusText,
  onComplete,
  isAudioPlaying = false,
  onToggleAudio,
  currentTrackName = "Pop Concert Anthem",
  onSwitchTrack,
}: LoadingScreenProps) {
  const [isFading, setIsFading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (progress >= 100) {
      setIsReady(true);
      const timer = setTimeout(() => {
        setIsFading(true);
        const finishTimer = setTimeout(() => {
          onComplete();
        }, 700);
        return () => clearTimeout(finishTimer);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [progress, onComplete]);

  // Total LED segmented indicator bars (20 segments)
  const totalBars = 20;
  const activeBars = Math.round((progress / 100) * totalBars);

  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col justify-between pointer-events-auto select-none overflow-hidden transition-all duration-700 p-5 sm:p-8 md:p-10 ${
        isFading ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* 
        CRITICAL: Completely transparent center so the 3D microphone and 
        EchoSphere shine through razor-sharp without heavy milky dark blur!
        Only subtle dark vignette at outer edges to frame the 3D model.
      */}
      <div className="absolute inset-0 bg-radial from-transparent via-[#040510]/35 to-[#040510]/80 pointer-events-none" />

      {/* Top Laser Flare Horizon */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent pointer-events-none" />

      {/* TOP HUD BAR */}
      <header className="relative z-10 w-full max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Concert Stage Rig Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/60 border border-cyan-500/30 backdrop-blur-md shadow-lg shadow-cyan-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span className="text-[10px] sm:text-[11px] font-mono tracking-widest text-cyan-300 uppercase font-semibold">
              3D SOUNDSTAGE IGNITION
            </span>
          </div>

          <div className="hidden md:inline-flex items-center px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-[10px] font-mono tracking-widest text-slate-400">
            AUDIO RES: 48kHz / 24-BIT
          </div>
        </div>

        {/* Right: Sound Controller & Skip Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onToggleAudio && (
            <button
              type="button"
              onClick={onToggleAudio}
              className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/70 hover:bg-slate-800/80 border border-purple-500/30 text-xs text-white transition-all backdrop-blur-md shadow-lg shadow-purple-500/15"
              title="Toggle Background Pop Music"
            >
              {isAudioPlaying ? (
                <>
                  {/* Equalizer animation */}
                  <span className="flex items-end gap-0.5 h-3">
                    <span className="w-0.5 h-full bg-cyan-400 rounded-full animate-pulse" />
                    <span className="w-0.5 h-3/5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "120ms" }} />
                    <span className="w-0.5 h-4/5 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: "240ms" }} />
                    <span className="w-0.5 h-2/3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "360ms" }} />
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono font-medium text-purple-200">
                    Beats: ON
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">Play Music</span>
                </>
              )}
            </button>
          )}

          {/* Quick Enter Stage button */}
          <button
            type="button"
            onClick={onComplete}
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/20 text-[10px] sm:text-[11px] font-mono text-slate-300 hover:text-white transition-all backdrop-blur-md"
            title="Skip loading screen"
          >
            <span>Enter Stage</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </header>

      {/* 
        CENTER ARENA FOCUS:
        Kept open and clear with framing target brackets around the 3D model!
      */}
      <div className="relative z-10 w-full max-w-4xl mx-auto flex-1 flex flex-col items-center justify-center pointer-events-none my-auto">
        {/* Subtle holographic stage crosshairs framing the 3D Mic & Orb */}
        <div className="relative w-full max-w-[260px] xs:max-w-xs sm:max-w-md h-44 xs:h-56 sm:h-72 flex items-center justify-between p-2 sm:p-4">
          {/* Top-Left Target Reticle */}
          <div className="absolute top-0 left-0 w-6 sm:w-8 h-6 sm:h-8 border-t-2 border-l-2 border-cyan-400/40 rounded-tl-lg" />
          {/* Top-Right Target Reticle */}
          <div className="absolute top-0 right-0 w-6 sm:w-8 h-6 sm:h-8 border-t-2 border-r-2 border-purple-400/40 rounded-tr-lg" />
          {/* Bottom-Left Target Reticle */}
          <div className="absolute bottom-0 left-0 w-6 sm:w-8 h-6 sm:h-8 border-b-2 border-l-2 border-cyan-400/40 rounded-bl-lg" />
          {/* Bottom-Right Target Reticle */}
          <div className="absolute bottom-0 right-0 w-6 sm:w-8 h-6 sm:h-8 border-b-2 border-r-2 border-purple-400/40 rounded-br-lg" />

          {/* Left Side Stage Spec */}
          <div className="hidden sm:flex flex-col items-start gap-1 text-[9px] font-mono text-slate-400 tracking-wider">
            <span className="text-cyan-400 font-bold">LIVE STAGE</span>
            <span>FREQ: 122 BPM</span>
            <span>SUB: ACTIVE</span>
          </div>

          {/* Center Subtle Beacon Ring */}
          <div
            className={`w-32 h-32 xs:w-40 xs:h-40 sm:w-56 sm:h-56 rounded-full border border-dashed border-cyan-400/20 mx-auto flex items-center justify-center transition-all duration-500 ${
              isReady ? "scale-110 border-cyan-400/60" : "scale-100 animate-spin"
            }`}
            style={{ animationDuration: "25s" }}
          />

          {/* Right Side Stage Spec */}
          <div className="hidden sm:flex flex-col items-end gap-1 text-[9px] font-mono text-slate-400 tracking-wider">
            <span className="text-purple-400 font-bold">ECHO RIG</span>
            <span>LASERS: ARMED</span>
            <span>ARENA: SUIET</span>
          </div>
        </div>
      </div>

      {/* BOTTOM CONCERT HUD CONSOLE */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center gap-3">
        {/* Artist Lineup & Event Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs font-mono uppercase tracking-[0.25em] text-cyan-300/90 font-bold">
            <span>SRINIVAS UNIVERSITY MUKKA</span>
            <span className="text-white/30">•</span>
            <span>NOV 2, 2026</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-[0_0_25px_rgba(56,189,248,0.35)]">
            ECHO<span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">SPHERE</span>
          </h1>

          <p className="text-xs sm:text-sm font-semibold text-slate-300 tracking-wide">
            Najran Kabeer × Benjamin Solomon Live
          </p>
        </div>

        {/* Futuristic Segmented LED Progress Bar */}
        <div className="w-full bg-slate-950/70 border border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-xl shadow-2xl shadow-indigo-950/50 space-y-3">
          {/* Status Row */}
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-300 truncate pr-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="tracking-wide text-[11px] sm:text-xs text-cyan-200 uppercase font-medium">
                {statusText}
              </span>
            </div>

            <div className="flex items-baseline gap-1 text-right flex-shrink-0">
              <span className="text-lg sm:text-xl font-bold font-mono text-white tracking-wider drop-shadow-[0_0_12px_rgba(56,189,248,0.8)]">
                {progress}
              </span>
              <span className="text-xs font-bold text-cyan-400 font-mono">%</span>
            </div>
          </div>

          {/* 20 Segmented LED Visualizer Blocks */}
          <div className="grid grid-cols-20 gap-1 sm:gap-1.5 h-3 sm:h-3.5 w-full bg-black/40 p-1 rounded-lg border border-white/10">
            {Array.from({ length: totalBars }).map((_, i) => {
              const isFilled = i < activeBars;
              return (
                <div
                  key={i}
                  className={`h-full rounded-sm transition-all duration-150 ${
                    isFilled
                      ? i > 15
                        ? "bg-gradient-to-t from-pink-500 to-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]"
                        : i > 10
                        ? "bg-gradient-to-t from-purple-500 to-indigo-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]"
                        : "bg-gradient-to-t from-cyan-500 to-blue-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                      : "bg-white/[0.06]"
                  }`}
                />
              );
            })}
          </div>

          {/* Bottom Prompts */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">ENGINE:</span>
              <span className="text-purple-300 font-semibold">{currentTrackName}</span>
              {onSwitchTrack && (
                <button
                  type="button"
                  onClick={onSwitchTrack}
                  className="cursor-pointer underline hover:text-cyan-300 transition-colors ml-1"
                >
                  Switch Beat
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-cyan-300/80">
              <span className="hidden sm:inline">Tap anywhere to enter</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
