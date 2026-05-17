/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Video, Edit3, Settings, Camera, Save, Download, Play, Pause, Plus, Trash2, ChevronUp, ChevronDown, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { AppMode, VideoData, Checkpoint, OverlayConfig } from './types';
import CameraView from './components/CameraView';
import EditorView from './components/EditorView';
import SettingsView from './components/SettingsView';
import { useTranslation, translations, isDefaultStateName } from './i18n';

export default function App() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AppMode>('record');
  const [focusedArea, setFocusedArea] = useState<'video' | 'editor'>('editor');
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({
    titleText: t.workProcess,
    panel: {
      x: 50,
      y: 50,
      scale: 0.8,
      fontSize: 16,
      textColor: '#ffffff',
      bgColor: '#000000',
      bgOpacity: 0.5,
      fontFamily: 'Inter, system-ui, sans-serif',
      width: 320,
      height: 160
    },
    title: {
      x: 50,
      y: 15,
      scale: 1.2,
      fontSize: 30,
      textColor: '#ffffff',
      bgColor: '#000000',
      bgOpacity: 0,
      fontFamily: 'Inter, system-ui, sans-serif'
    },
    time: {
      x: 50,
      y: 85,
      scale: 1.0,
      fontSize: 36,
      textColor: '#ffffff',
      bgColor: '#000000',
      bgOpacity: 0,
      fontFamily: 'Inter, system-ui, sans-serif'
    }
  });

  // Keep stateNameHistory synchronized with defaultStates when language changes
  const [stateNameHistory, setStateNameHistory] = useState<string[]>(t.defaultStates);
  
  useEffect(() => {
    // Optionally update workProcess title text when language changes, if it's still default
    setOverlayConfig(prev => {
      const isDefaultTitle = Object.values(translations).some(
        langTranslations => langTranslations.workProcess === prev.titleText
      );
      if (isDefaultTitle) {
        return { ...prev, titleText: t.workProcess };
      }
      return prev;
    });
    // Set default state names
    setStateNameHistory(prev => {
      // Very basic logic: if history is identical to ANY language's default states, translate them
      if (prev.length === 4) {
        const isDefaultStates = Object.values(translations).some(
          langTranslations => JSON.stringify(langTranslations.defaultStates) === JSON.stringify(prev)
        );
        if (isDefaultStates) {
          return t.defaultStates;
        }
      }
      return prev;
    });

    // Translate checkpoint default names if videoData exists
    setVideoData(prev => {
      if (!prev) return prev;
      let changed = false;
      const newCheckpoints = prev.checkpoints.map(cp => {
        if (isDefaultStateName(cp.stateName)) {
           changed = true;
           return { ...cp, stateName: t.newState };
        }
        return cp;
      });
      if (changed) {
        return { ...prev, checkpoints: newCheckpoints };
      }
      return prev;
    });

  }, [t]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle recorded video
  const handleVideoRecorded = useCallback((url: string, duration: number, checkpoints: Checkpoint[]) => {
    setVideoData({ url, duration, checkpoints });
    setMode('edit');
  }, []);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.onloadedmetadata = () => {
      handleVideoRecorded(url, video.duration, []);
    };
  };

  const updateCheckpoints = useCallback((newCheckpoints: Checkpoint[]) => {
    setVideoData(prev => prev ? { ...prev, checkpoints: newCheckpoints } : null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0B] text-slate-200 overflow-hidden font-sans">
      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {mode === 'record' && (
            <motion.div
              key="record"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <CameraView onVideoReady={handleVideoRecorded} stateNameHistory={stateNameHistory} />
            </motion.div>
          )}

          {mode === 'edit' && (
            <motion.div
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              {videoData ? (
                <EditorView
                  videoData={videoData}
                  overlayConfig={overlayConfig}
                  setOverlayConfig={setOverlayConfig}
                  onUpdateCheckpoints={updateCheckpoints}
                  stateNameHistory={stateNameHistory}
                  focusedArea={focusedArea}
                  setFocusedArea={setFocusedArea}
                  onLoadProject={(data) => {
                    if (data.videoData) setVideoData(data.videoData);
                    if (data.overlayConfig) setOverlayConfig(data.overlayConfig);
                  }}
                />
              ) : (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#121214]">
                  <Video className="w-16 h-16 mb-4 text-white/20" />
                  <h2 className="text-xl font-bold tracking-tight mb-2 uppercase">{t.noVideo}</h2>
                  <p className="text-white/40 mb-6 text-sm">{t.noVideoDesc}</p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setMode('record')}
                      className="px-8 py-3 bg-orange-500 text-black rounded-full font-bold uppercase tracking-widest text-xs hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      {t.startRecording}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-8 py-3 bg-neutral-800 text-white rounded-full font-bold uppercase tracking-widest text-xs hover:bg-neutral-700 transition-colors border border-white/10 flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      {t.importFile}
                    </button>
                    <input 
                      type="file" 
                      accept="video/mp4,video/webm" 
                      onChange={handleFileImport} 
                      className="hidden" 
                      ref={fileInputRef} 
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {mode === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <SettingsView
                overlayConfig={overlayConfig}
                setOverlayConfig={setOverlayConfig}
                stateNameHistory={stateNameHistory}
                setStateNameHistory={setStateNameHistory}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className={cn(
        "h-20 bg-[#0F0F11] border-t border-white/10 flex items-center justify-around px-2 sm:px-4 pb-safe landscape:absolute landscape:bottom-0 landscape:bg-transparent landscape:border-0 landscape:z-50 pointer-events-none",
        mode === 'record'
          ? "landscape:w-[calc(100vw-8rem)] landscape:sm:w-[calc(100vw-11rem)] landscape:left-0 landscape:justify-center landscape:gap-16"
          : cn(
              "landscape:right-0 transition-all duration-500",
              mode === 'edit' && focusedArea === 'video' ? "landscape:w-[30vw]" : "landscape:w-[65vw]"
            )
      )}>
        <NavButton
          active={mode === 'record'}
          onClick={() => setMode('record')}
          icon={<Camera className="w-5 h-5" />}
          label={t.navRecord}
        />
        <NavButton
          active={mode === 'edit'}
          onClick={() => {
            setMode('edit');
            setFocusedArea('editor');
          }}
          icon={<Edit3 className="w-5 h-5" />}
          label={t.navEdit}
        />
        <NavButton
          active={mode === 'settings'}
          onClick={() => setMode('settings')}
          icon={<Settings className="w-5 h-5" />}
          label={t.navSettings}
        />
      </nav>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1.5 transition-all relative px-1 sm:px-4 py-2 pointer-events-auto shadow-none min-w-0 mx-1",
        active ? "text-orange-500" : "text-white/40 hover:text-white"
      )}
    >
      <div className="shrink-0">{icon}</div>
      <span className="text-[8px] sm:text-[9px] uppercase tracking-widest font-black truncate max-w-full">{label}</span>
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute -bottom-[20px] w-10 h-1 bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]"
        />
      )}
    </button>
  );
}

