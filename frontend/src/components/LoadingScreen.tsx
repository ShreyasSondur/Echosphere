"use client";

import { useEffect, useState } from "react";

interface LoadingScreenProps {
  onComplete: () => void;
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [statusText, setStatusText] = useState("INITIALIZING ECHOSPHERE...");

  useEffect(() => {
    const statusSequence = [
      { at: 15, text: "TUNING FREQUENCIES • SRINIVAS UNIVERSITY" },
      { at: 35, text: "CALIBRATING WEBFLOW × ROTARACT SOUNDSTAGE" },
      { at: 65, text: "LOADING 3D ECHOSPHERE VISUALIZERS..." },
      { at: 85, text: "SYNCING NAJRAN KABEER & BENJI BEATS SETS..." },
      { at: 100, text: "WELCOME TO ECHOSPHERE 2026" },
    ];

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        const step = Math.floor(Math.random() * 8) + 5;
        const next = Math.min(prev + step, 100);
        const match = statusSequence.slice().reverse().find((s) => next >= s.at);
        if (match) setStatusText(match.text);
        return next;
      });
    }, 55);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress === 100) {
      const timer = setTimeout(() => {
        setIsFading(true);
        const finishTimer = setTimeout(() => {
          onComplete();
        }, 750);
        return () => clearTimeout(finishTimer);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [progress, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050614] text-white transition-all duration-700 select-none overflow-hidden ${
        isFading ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Dynamic Purple-Blue ambient stage glows */}
      <div className="absolute w-[600px] h-[600px] bg-gradient-to-tr from-purple-600/30 via-indigo-600/25 to-blue-500/30 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center max-w-lg w-full px-6 text-center space-y-7">
        
        {/* Collaborative Presenters Tag */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-purple-500/30 backdrop-blur-xl shadow-lg shadow-purple-500/10">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <span className="text-[11px] font-mono tracking-widest text-purple-300 uppercase">
            Webflow Community × Rotaract
          </span>
        </div>

        {/* The Animated 3D EchoSphere Portal Core */}
        <div className="relative w-40 h-40 flex items-center justify-center">
          {/* Outer Rotating Blue Ring */}
          <div
            className="absolute inset-0 rounded-full border border-blue-500/40 border-t-blue-400 border-r-transparent animate-spin"
            style={{ animationDuration: "3s" }}
          />

          {/* Middle Counter-Rotating Purple Ring */}
          <div
            className="absolute inset-2 rounded-full border border-purple-500/40 border-b-purple-400 border-l-transparent animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "2.2s" }}
          />

          {/* Inner Pulsing Neon EchoSphere Orb */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-[2px] shadow-[0_0_50px_rgba(139,92,246,0.6)] animate-pulse">
            <div className="w-full h-full rounded-full bg-[#07091a] flex flex-col items-center justify-center">
              <span className="text-xl font-black bg-gradient-to-r from-purple-300 via-white to-blue-300 bg-clip-text text-transparent">
                ES
              </span>
              <span className="text-[8px] font-mono tracking-widest text-blue-400">
                2026
              </span>
            </div>
          </div>

          {/* Audio equalizing wave bursts */}
          <div className="absolute -inset-4 flex items-center justify-center pointer-events-none">
            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
          </div>
        </div>

        {/* Title & Venue */}
        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-purple-200 to-blue-400 bg-clip-text text-transparent drop-shadow-lg">
            ECHOSPHERE
          </h1>
          <p className="text-xs sm:text-sm font-semibold tracking-wider text-purple-300">
            Srinivas University Mukka (SUIET)
          </p>
          <p className="text-[11px] font-mono text-slate-400 tracking-wider">
            Najran Kabeer × Benji Beats Live
          </p>
        </div>

        {/* Progress Bar & Status Text */}
        <div className="w-full max-w-xs space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="truncate pr-2">{statusText}</span>
            <span className="text-blue-400 font-bold">{progress}%</span>
          </div>

          <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden p-[1px] border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-150 shadow-[0_0_16px_rgba(99,102,241,0.9)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Date Stamp */}
        <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
          2nd Nov 2026 • 5:30 PM • SUIET Campus Mukka
        </div>
      </div>
    </div>
  );
}
