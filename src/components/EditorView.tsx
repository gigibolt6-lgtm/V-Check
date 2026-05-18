import React, { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import { Play, Pause, Plus, Trash2, ChevronUp, ChevronDown, Download, Move, ExternalLink, Type, Palette, Maximize, Scissors, Pin, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatTime } from '../lib/utils';
import { VideoData, Checkpoint, OverlayConfig } from '../types';
import CheckpointOverlay from './CheckpointOverlay';
import { useVideoExport } from '../hooks/useVideoExport';
import { useTranslation, translations, isDefaultStateName } from '../i18n';
import JSZip from 'jszip';


const getVideoMetadataDurationMs = (url: string) => new Promise<number | null>((resolve) => {
  const video = document.createElement('video');

  const cleanup = () => {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
  };

  video.preload = 'metadata';
  video.onloadedmetadata = () => {
    const durationMs = video.duration * 1000;
    cleanup();
    resolve(Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null);
  };
  video.onerror = () => {
    cleanup();
    resolve(null);
  };
  video.src = url;
  video.load();
});

const normalizeLoadedProjectVideoData = (loadedVideoData: VideoData, actualVideoDurationMs: number | null): VideoData => {
  const savedDuration = loadedVideoData.duration;

  if (
    actualVideoDurationMs &&
    Number.isFinite(savedDuration) &&
    savedDuration > 0 &&
    savedDuration < 1000 &&
    Math.abs(savedDuration * 1000 - actualVideoDurationMs) < Math.abs(savedDuration - actualVideoDurationMs)
  ) {
    return {
      ...loadedVideoData,
      duration: savedDuration * 1000,
    };
  }

  return loadedVideoData;
};

interface EditorViewProps {
  videoData: VideoData;
  overlayConfig: OverlayConfig;
  setOverlayConfig: (config: OverlayConfig) => void;
  onUpdateCheckpoints: (checkpoints: Checkpoint[]) => void;
  stateNameHistory: string[];
  focusedArea: 'video' | 'editor';
  setFocusedArea: (area: 'video' | 'editor') => void;
  onLoadProject?: (data: { videoData?: VideoData, overlayConfig?: OverlayConfig }) => void;
}

export default function EditorView({ 
  videoData, 
  overlayConfig, 
  setOverlayConfig, 
  onUpdateCheckpoints,
  stateNameHistory,
  focusedArea,
  setFocusedArea,
  onLoadProject
}: EditorViewProps) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [editingCheckpointId, setEditingCheckpointId] = useState<string | null>(null);
  const [showExporter, setShowExporter] = useState(false);
  const [editingSpeedUpId, setEditingSpeedUpId] = useState<string | null>(null);
  const [tempDelayValue, setTempDelayValue] = useState<string>("");
  
  useEffect(() => {
    if (editingSpeedUpId) {
      const cp = videoData.checkpoints.find(c => c.id === editingSpeedUpId);
      if (cp) {
        setTempDelayValue(String(cp.speedUp?.delaySeconds ?? 0));
      }
    } else {
      setTempDelayValue("");
    }
  }, [editingSpeedUpId, videoData.checkpoints]);

  const [draggingCpId, setDraggingCpId] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isLongPressed, setIsLongPressed] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeTab, setActiveTab] = useState<'points' | 'styling'>('points');

  const clampZoomLevel = (value: number) => Math.max(1, Math.min(20, value));
  const updateZoomLevel = (value: number) => setZoomLevel(clampZoomLevel(value));
  const adjustZoomLevel = (delta: number) => setZoomLevel(prev => clampZoomLevel(prev + delta));
  const stopZoomControlPropagation = (e: React.PointerEvent | React.TouchEvent) => {
    e.stopPropagation();
  };
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setWrapperSize(prev => {
        if (prev.width === entry.contentRect.width && prev.height === entry.contentRect.height) {
          return prev;
        }
        return {
          width: entry.contentRect.width,
          height: entry.contentRect.height
        };
      });
    });
    if (containerWrapperRef.current) {
      observer.observe(containerWrapperRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight);
    }
  };

  const containerStyle = useMemo(() => {
    if (wrapperSize.width === 0 || wrapperSize.height === 0) return { width: '100%', height: '100%' };
    
    const aspect = (typeof videoAspectRatio !== 'number' || isNaN(videoAspectRatio) || videoAspectRatio <= 0) ? (16 / 9) : videoAspectRatio;
    const wrapperAspect = wrapperSize.width / wrapperSize.height;

    let w = wrapperSize.width;
    let h = wrapperSize.height;

    if (aspect > wrapperAspect) { // video is wider than wrapper
      w = wrapperSize.width;
      h = wrapperSize.width / aspect;
    } else { // video is taller than wrapper
      w = wrapperSize.height * aspect;
      h = wrapperSize.height;
    }

    if (isNaN(w) || w <= 0) w = wrapperSize.width || 320;
    if (isNaN(h) || h <= 0) h = wrapperSize.height || 180;

    return { 
      width: w, 
      height: h 
    };
  }, [wrapperSize, videoAspectRatio]);

  const renderScale = useMemo(() => {
    let w = typeof containerStyle.width === 'number' ? containerStyle.width : 100;
    let h = typeof containerStyle.height === 'number' ? containerStyle.height : 100;
    
    if (isNaN(w) || w <= 0) w = 100;
    if (isNaN(h) || h <= 0) h = 100;

    const maxDim = Math.max(w, h);
    const scale = maxDim / 1024;
    return (isNaN(scale) || scale <= 0) ? 1 : scale;
  }, [containerStyle.width, containerStyle.height]);

  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);

  const updateSpeedUpConfig = (id: string, config: { multiplier: number; delaySeconds: number } | undefined) => {
    onUpdateCheckpoints(videoData.checkpoints.map(cp => 
      cp.id === id ? { ...cp, speedUp: config } : cp
    ));
  };

  const [selectedOverlayElement, setSelectedOverlayElement] = useState<'title' | 'time' | 'panel'>('title');
  const [overlayDragState, setOverlayDragState] = useState<{ 
    element: string | null, 
    startX: number, 
    startY: number, 
    startLeft: number, 
    startTop: number,
    isTrackpad?: boolean,
    trackpadWidth?: number,
    trackpadHeight?: number
  } | null>(null);

  const currentStyle = overlayConfig[selectedOverlayElement];

  const updateStyle = (updates: Partial<typeof currentStyle>) => {
    setOverlayConfig({
      ...overlayConfig,
      [selectedOverlayElement]: { ...currentStyle, ...updates }
    });
  };

  const activeCheckpointIndex = useMemo(() => {
    const sorted = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
    return sorted.findLastIndex(cp => cp.time <= currentTime);
  }, [videoData.checkpoints, currentTime]);

  // Sync state with video time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (draggingCpId || isScrubbing) return; // Ignore time updates while dragging
      const timeMs = video.currentTime * 1000;
      setCurrentTime(prev => prev !== timeMs ? timeMs : prev);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [draggingCpId, isScrubbing]);

  // Handle zooming
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY * -0.01;
        setZoomLevel(prev => {
          const newZoom = clampZoomLevel(prev + prev * zoomDelta);
          if (newZoom !== prev) {
             const ratio = newZoom / prev;
             const mouseX = e.clientX - container.getBoundingClientRect().left;
             const scrollCenter = container.scrollLeft + mouseX;
             container.scrollLeft = scrollCenter * ratio - mouseX;
          }
          return newZoom;
        });
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, []);


  // Handle scrubbing
  useEffect(() => {
    if (!isScrubbing) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!seekBarRef.current) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTimeMs = percentage * Math.max(1, videoData.duration);
      
      if (videoRef.current) {
        videoRef.current.currentTime = newTimeMs / 1000;
        setCurrentTime(newTimeMs);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      setIsScrubbing(false);
      setDraggingCpId(null);
      setIsLongPressed(false);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isScrubbing, videoData.duration]);

  // Handle marker dragging
  useEffect(() => {
    if (!draggingCpId) {
      setIsLongPressed(prev => prev ? false : prev);
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!seekBarRef.current || !isLongPressed) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTimeMs = percentage * Math.max(1, videoData.duration);
      
      onUpdateCheckpoints(
        videoData.checkpoints.map(cp => 
          cp.id === draggingCpId ? { ...cp, time: newTimeMs } : cp
        )
      );

      if (videoRef.current) {
        videoRef.current.currentTime = newTimeMs / 1000;
        setCurrentTime(newTimeMs);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      setDraggingCpId(null);
      setIsLongPressed(false);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingCpId, isLongPressed, videoData, onUpdateCheckpoints]);

  const handleSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!seekBarRef.current) return;

    if ((e.target as HTMLElement).closest('[data-marker="true"]')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsScrubbing(true);

    const rect = seekBarRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTimeMs = percentage * Math.max(1, videoData.duration);
    
    if (videoRef.current) {
      videoRef.current.currentTime = newTimeMs / 1000;
      setCurrentTime(newTimeMs);
    }
    
    // Deselect marker if clicking on track
    if ((e.target as HTMLElement).getAttribute('data-track')) {
      setSelectedCheckpointId(null);
    }
  };

  const handleSeekDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTab !== 'points') return;
    if (!seekBarRef.current) return;
    if (!(e.target as HTMLElement).getAttribute('data-track')) return; // Only add if clicking the track itself
    
    const rect = seekBarRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTimeMs = Math.round(percentage * Math.max(1, videoData.duration));
    
    const newCp: Checkpoint = {
      id: Math.random().toString(36).substr(2, 9),
      time: newTimeMs,
      stateName: t.newState
    };
    
    const updated = [...videoData.checkpoints, newCp].sort((a, b) => a.time - b.time);
    onUpdateCheckpoints(updated);
    setSelectedCheckpointId(newCp.id);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const addCheckpointAtCurrentTime = () => {
    const newCp: Checkpoint = {
      id: Math.random().toString(36).substr(2, 9),
      time: currentTime,
      stateName: t.newState
    };
    const updated = [...videoData.checkpoints, newCp].sort((a, b) => a.time - b.time);
    onUpdateCheckpoints(updated);
  };

  const removeCheckpoint = (id: string) => {
    onUpdateCheckpoints(videoData.checkpoints.filter(cp => cp.id !== id));
  };

  const updateCheckpointName = (id: string, name: string) => {
    onUpdateCheckpoints(videoData.checkpoints.map(cp => 
      cp.id === id ? { ...cp, stateName: name } : cp
    ));
    setEditingCheckpointId(null);
  };

  const currentTotalTime = useMemo(() => {
    if (videoData.checkpoints.length === 0) return 0;
    const sorted = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
    const startTime = sorted[0].time;
    if (currentTime < startTime) return 0;
    if (videoData.checkpoints.length >= 2 && currentTime > sorted[sorted.length - 1].time) {
      return sorted[sorted.length - 1].time - startTime;
    }
    return currentTime - startTime;
  }, [videoData.checkpoints, currentTime]);

  const totalCycleTime = useMemo(() => {
    if (videoData.checkpoints.length < 2) return 0;
    const sorted = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
    return sorted[sorted.length - 1].time - sorted[0].time;
  }, [videoData.checkpoints]);

  const { isExporting, exportProgress, startExport } = useVideoExport(
    videoRef,
    containerRef,
    videoData,
    overlayConfig,
    totalCycleTime
  );

  // Sync playback speed based on checkpoints and speedup configurations
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;

    const loop = () => {
      if (isPlaying || isExporting) {
        const timeMs = video.currentTime * 1000;
        let targetRate = 1.0;
        
        const sorted = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
        const activeIndex = sorted.findLastIndex(cp => cp.time <= timeMs);
        
        if (activeIndex >= 0 && activeIndex < sorted.length - 1) {
           const cp = sorted[activeIndex];
           if (cp.speedUp) {
              const timeSinceCp = timeMs - cp.time;
              if (timeSinceCp > cp.speedUp.delaySeconds * 1000) {
                  targetRate = cp.speedUp.multiplier;
              }
           }
        }
        
        if (video.playbackRate !== targetRate) {
           video.playbackRate = targetRate;
        }
      } else {
        if (video.playbackRate !== 1.0) {
           video.playbackRate = 1.0;
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    loop();

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isExporting, videoData.checkpoints]);

  // Handle dragging overlay
  // Set up overlay dragging
  useEffect(() => {
    if (!overlayDragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current || !overlayDragState) return;
      const rect = containerRef.current.getBoundingClientRect();
      const widthRange = overlayDragState.isTrackpad && overlayDragState.trackpadWidth ? overlayDragState.trackpadWidth : rect.width;
      const heightRange = overlayDragState.isTrackpad && overlayDragState.trackpadHeight ? overlayDragState.trackpadHeight : rect.height;

      const dx = ((e.clientX - overlayDragState.startX) / widthRange) * 100;
      const dy = ((e.clientY - overlayDragState.startY) / heightRange) * 100;

      const el = overlayDragState.element as 'panel' | 'title' | 'time';
      setOverlayConfig({
        ...overlayConfig,
        [el]: {
          ...overlayConfig[el],
          x: Math.max(-50, Math.min(150, overlayDragState.startLeft + dx)),
          y: Math.max(-50, Math.min(150, overlayDragState.startTop + dy))
        }
      });
    };

    const handlePointerUp = () => {
      setOverlayDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [overlayDragState, setOverlayConfig]);

  const handleTrackpadPointerDown = (e: React.PointerEvent) => {
    if (activeTab !== 'styling') return;
    e.stopPropagation();
    
    // Convert absolute pos to relative trackpad scaled pos
    const rect = e.currentTarget.getBoundingClientRect();
    
    setOverlayDragState({
      element: selectedOverlayElement,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: overlayConfig[selectedOverlayElement].x,
      startTop: overlayConfig[selectedOverlayElement].y,
      isTrackpad: true,
      trackpadWidth: rect.width,
      trackpadHeight: rect.height
    });
  };

  const handleOverlayPointerDown = (e: React.PointerEvent, element: 'panel' | 'title' | 'time') => {
    if (activeTab !== 'styling') return;
    e.stopPropagation();
    setSelectedOverlayElement(element);
    
    // Save starting positions
    setOverlayDragState({
      element,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: overlayConfig[element].x,
      startTop: overlayConfig[element].y
    });
  };

  const sortedCheckpoints = [...videoData.checkpoints].sort((a, b) => a.time - b.time);

  const exportCSV = () => {
    let csvContent = "\uFEFF"; // BOM for UTF-8
    csvContent += `${t.csvHeader}\n`;
    
    let cumulativeMs = 0;
    
    sortedCheckpoints.forEach((cp, idx) => {
      // If there is a next checkpoint, duration is difference. Otherwise, use remaining video duration,
      // or if it's the very end of video, maybe 0. Let's use `videoData.duration - cp.time` but cap at 0 just in case.
      const nextTime = idx < sortedCheckpoints.length - 1 ? sortedCheckpoints[idx + 1].time : videoData.duration;
      let durationMs = Math.max(0, nextTime - cp.time);
      
      cumulativeMs += durationMs;
      
      const number = idx + 1;
      const name = `"${cp.stateName.replace(/"/g, '""')}"`; // escape quotes
      const timeStr = formatTime(durationMs);
      const cumulativeStr = formatTime(cumulativeMs);
      
      csvContent += `${number},${name},${timeStr},${cumulativeStr}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = (overlayConfig.titleText || 'video_checkpoints').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.href = url;
    link.setAttribute('download', `${safeTitle}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const saveProject = async () => {
    try {
      const zip = new JSZip();
      const projectData = {
        checkpoints: videoData.checkpoints,
        overlayConfig: overlayConfig,
        duration: videoData.duration,
      };
      
      zip.file('project.json', JSON.stringify(projectData, null, 2));

      // Attempt to fetch the video blob from the URL
      if (videoData.url.startsWith('blob:')) {
        const videoResponse = await fetch(videoData.url);
        const videoBlob = await videoResponse.blob();
        const extension = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
        zip.file(`video.${extension}`, videoBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project_${new Date().getTime()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to save project', err);
      alert('Failed to save project');
    }
  };

  const loadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.zip')) {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        
        let newVideoData: VideoData | undefined;
        let newOverlayConfig: OverlayConfig | undefined;
        
        // Search for JSON
        const jsonFile = loadedZip.file('project.json');
        if (jsonFile) {
          const jsonContent = await jsonFile.async('string');
          const data = JSON.parse(jsonContent);
          
          if (data.checkpoints && Array.isArray(data.checkpoints)) {
            onUpdateCheckpoints(data.checkpoints);
          }
          if (data.overlayConfig) {
            newOverlayConfig = data.overlayConfig;
          }
          if (data.duration) {
            newVideoData = { ...videoData, duration: data.duration, checkpoints: data.checkpoints || videoData.checkpoints };
          }
        }
        
        // Search for Video
        const videoFileRegex = /^video\.(webm|mp4)$/;
        const videoFile = Object.values(loadedZip.files).find(f => videoFileRegex.test(f.name));
        
        if (videoFile) {
          const videoBlob = await videoFile.async('blob');
          const videoUrl = URL.createObjectURL(videoBlob);
          newVideoData = {
            ...(newVideoData || videoData),
            url: videoUrl,
          };
        }
        
        if (onLoadProject) {
          const actualVideoDurationMs = newVideoData?.url ? await getVideoMetadataDurationMs(newVideoData.url) : null;
          onLoadProject({
            videoData: newVideoData ? normalizeLoadedProjectVideoData(newVideoData, actualVideoDurationMs) : undefined,
            overlayConfig: newOverlayConfig,
          });
          setShowExporter(false);
        }
      } else if (file.name.endsWith('.json')) {
         // Legacy JSON-only load fallback
         const text = await file.text();
         const data = JSON.parse(text);
         if (data.checkpoints && Array.isArray(data.checkpoints)) onUpdateCheckpoints(data.checkpoints);
         if (data.overlayConfig) setOverlayConfig(data.overlayConfig);
         setShowExporter(false);
      }
    } catch (err) {
      console.error('Failed to load project file', err);
      alert('Invalid project file');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const stageRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={stageRef} className="flex flex-col landscape:flex-row h-full bg-[#0A0A0B] relative overflow-hidden">
      {/* Left Pane (Video & Controls) */}
      <div 
        onClick={() => setFocusedArea('video')}
        className={cn(
          "flex flex-col relative transition-all duration-500 ease-in-out shrink-0",
          selectedCheckpointId 
            ? "h-[80vh] landscape:h-full landscape:w-[85vw]"
            : focusedArea === 'video' 
              ? "h-[60vh] landscape:h-full landscape:w-[70vw]"
              : "h-[30vh] landscape:h-full landscape:w-[35vw]"
        )}
      >
        <div 
          ref={containerWrapperRef}
          className="flex-1 relative bg-black overflow-hidden select-none min-h-0 w-full rounded-b-xl sm:rounded-none flex items-center justify-center p-0"
        >
          <div
            ref={containerRef}
            className="relative"
            style={containerStyle}
          >
            <video
              ref={videoRef}
              src={videoData.url}
              className="w-full h-full object-fill pointer-events-auto"
              onEnded={() => setIsPlaying(false)}
              onClick={togglePlay}
              onLoadedMetadata={handleLoadedMetadata}
            />

            {/* Drumroll Overlay Content */}
        <div
          onPointerDownCapture={(e) => handleOverlayPointerDown(e, 'panel')}
          style={{ 
            position: 'absolute', 
            left: `${overlayConfig.panel.x}%`, 
            top: `${overlayConfig.panel.y}%`,
            cursor: activeTab === 'styling' ? 'move' : 'default',
            transform: `translate(-50%, -50%) scale(${overlayConfig.panel.scale * renderScale})`,
            transformOrigin: 'center',
            touchAction: activeTab === 'styling' ? 'none' : 'auto'
          }}
          className={cn(
            "z-20 p-2 border border-dashed rounded transition-colors relative",
            activeTab === 'styling' ? (selectedOverlayElement === 'panel' ? "border-orange-500/80 pointer-events-auto" : "border-white/30 hover:border-orange-500/40 pointer-events-auto") : "border-transparent pointer-events-none"
          )}
        >
          {activeTab === 'styling' && (
             <div className="absolute inset-[-8px] z-0 bg-transparent cursor-move" />
          )}
          {overlayConfig.panel.bgOpacity > 0 && (
             <div className="absolute inset-0 rounded-2xl" style={{ backgroundColor: overlayConfig.panel.bgColor, opacity: overlayConfig.panel.bgOpacity, zIndex: -1 }} />
          )}
          <div className="relative z-10 w-full h-full pointer-events-none">
            <CheckpointOverlay 
              checkpoints={videoData.checkpoints} 
              currentTime={currentTime} 
              activeCheckpointIndex={activeCheckpointIndex}
              config={overlayConfig}
              totalCycleTime={totalCycleTime}
            />
          </div>
        </div>

        {/* Title Overlay */}
        <div
          onPointerDownCapture={(e) => handleOverlayPointerDown(e, 'title')}
          style={{ 
            position: 'absolute', 
            left: `${overlayConfig.title.x}%`, 
            top: `${overlayConfig.title.y}%`,
            cursor: activeTab === 'styling' ? 'move' : 'default',
            fontFamily: overlayConfig.title.fontFamily,
            transform: `translate(-50%, -50%) scale(${overlayConfig.title.scale * renderScale})`,
            transformOrigin: 'center',
            touchAction: activeTab === 'styling' ? 'none' : 'auto'
          }}
          className={cn(
            "z-20 p-4 border border-dashed rounded transition-colors relative",
            activeTab === 'styling' ? (selectedOverlayElement === 'title' ? "border-orange-500/80 shadow-2xl pointer-events-auto" : "border-white/30 hover:border-orange-500/40 pointer-events-auto shadow-2xl") : "border-transparent pointer-events-none"
          )}
        >
          {activeTab === 'styling' && (
             <div className="absolute inset-[-8px] z-0 bg-transparent cursor-move" />
          )}
          {overlayConfig.title.bgOpacity > 0 && (
             <div className="absolute inset-0 rounded" style={{ backgroundColor: overlayConfig.title.bgColor, opacity: overlayConfig.title.bgOpacity, zIndex: -1 }} />
          )}
          <h2 
            style={{ 
              color: overlayConfig.title.textColor,
              fontSize: `${overlayConfig.title.fontSize}px`,
            }}
            className="font-black tracking-tight whitespace-nowrap relative z-10 pointer-events-none"
          >
            {overlayConfig.titleText}
          </h2>
        </div>

        {/* Total Time Overlay */}
        <div
          onPointerDownCapture={(e) => handleOverlayPointerDown(e, 'time')}
          style={{ 
            position: 'absolute', 
            left: `${overlayConfig.time.x}%`, 
            top: `${overlayConfig.time.y}%`,
            cursor: activeTab === 'styling' ? 'move' : 'default',
            fontFamily: overlayConfig.time.fontFamily,
            transform: `translate(-50%, -50%) scale(${overlayConfig.time.scale * renderScale})`,
            transformOrigin: 'center',
            touchAction: activeTab === 'styling' ? 'none' : 'auto'
          }}
          className={cn(
            "z-20 p-4 border border-dashed rounded transition-colors flex flex-col items-center gap-1 relative whitespace-nowrap",
            activeTab === 'styling' ? (selectedOverlayElement === 'time' ? "border-orange-500/80 shadow-2xl pointer-events-auto" : "border-white/30 hover:border-orange-500/40 pointer-events-auto shadow-2xl") : "border-transparent pointer-events-none"
          )}
        >
          {activeTab === 'styling' && (
             <div className="absolute inset-[-8px] z-0 bg-transparent cursor-move" />
          )}
          {overlayConfig.time.bgOpacity > 0 && (
             <div className="absolute inset-0 rounded" style={{ backgroundColor: overlayConfig.time.bgColor, opacity: overlayConfig.time.bgOpacity, zIndex: -1 }} />
          )}
          <div 
            className="flex flex-col items-center w-full whitespace-nowrap relative z-10 pointer-events-none"
          >
             <span style={{ color: overlayConfig.time.textColor, fontSize: '10px' }} className="font-black uppercase tracking-widest opacity-60 mb-1 whitespace-nowrap">{t.totalTime}</span>
             <span style={{ color: overlayConfig.time.textColor, fontSize: `${overlayConfig.time.fontSize}px` }} className="font-mono font-bold tracking-tight leading-none whitespace-nowrap">
               {formatTime(currentTotalTime)}
             </span>
          </div>
        </div>
          </div>
        </div> {/* End of container wrapper */}

        {/* Video Controls (Overlay) */}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 px-2 sm:px-6 pb-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-2 landscape:pb-0 z-40 pointer-events-none transition-all",
          activeTab === 'styling' ? "pt-2 sm:pt-4" : "pt-12 sm:pt-24"
        )}>
          {/* Enhanced Timeline */}
          <div className="relative w-full pointer-events-auto">
            <div className={cn(
              "absolute left-0 right-0 bottom-0 rounded-lg border border-white/10 bg-black/40 backdrop-blur-md pointer-events-none transition-all",
              activeTab === 'styling' ? "h-4" : "h-14"
            )} />
            <div 
              className={cn(
                "w-full relative overflow-x-auto overflow-y-hidden no-scrollbar transition-all touch-none",
                activeTab === 'styling' ? "pt-1" : "pt-20"
              )}
              ref={scrollContainerRef}
            >
              <div 
                className={cn(
                  "flex items-center relative cursor-col-resize group min-w-full transition-all touch-none",
                  activeTab === 'styling' ? "h-4" : "h-14"
                )}
              style={{ width: `${zoomLevel * 100}%` }}
              ref={seekBarRef}
              onPointerDown={handleSeekPointerDown}
              onDoubleClick={handleSeekDoubleClick}
              title={t.seekHint}
              data-track="true"
            >
            {/* Background Track */}
            <div 
              className={cn(
                "w-full bg-white/10 rounded-full relative transition-all pointer-events-none",
                activeTab === 'styling' ? "h-1" : "h-3 group-hover:h-5"
              )}
              data-track="true"
            >
              <div 
                className="absolute h-full bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)]"
                style={{ width: `${(currentTime / Math.max(1, videoData.duration)) * 100}%` }}
              />

              {/* Speedup Zones (overlay) */}
              {sortedCheckpoints.map((cp, idx) => {
                if (!cp.speedUp) return null;
                const startTimeMs = cp.time + cp.speedUp.delaySeconds * 1000;
                const endTimeMs = idx < sortedCheckpoints.length - 1 ? sortedCheckpoints[idx + 1].time : videoData.duration;
                if (startTimeMs >= endTimeMs) return null;
                
                const leftPercent = (startTimeMs / Math.max(1, videoData.duration)) * 100;
                const widthPercent = ((endTimeMs - startTimeMs) / Math.max(1, videoData.duration)) * 100;
                
                return (
                  <div 
                    key={`speedup-${cp.id}`}
                    className="absolute h-full bg-cyan-400/80 rounded-full flex justify-center items-center backdrop-mix-blend-overlay"
                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                  >
                    <div className="absolute top-full mt-1 text-[9px] font-black text-cyan-400 whitespace-nowrap bg-black/50 px-1 rounded">
                      [{cp.speedUp.multiplier}x]
                    </div>
                  </div>
                );
              })}
              
              {/* Playhead */}
              <div 
                className="absolute top-1/2 -mt-2.5 w-5 h-5 bg-white border-4 border-orange-500 rounded-full shadow-lg opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none"
                style={{ left: `calc(${(currentTime / Math.max(1, videoData.duration)) * 100}% - 10px)` }}
              >
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-orange-500 text-black text-[10px] font-black px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                  {formatTime(currentTime)}
                </div>
              </div>
            </div>

            {/* Checkpoint Markers */}
            {videoData.checkpoints.map((cp, idx) => {
              const leftPercent = (cp.time / Math.max(1, videoData.duration)) * 100;
              const isDragging = cp.id === draggingCpId;
              const isSelected = cp.id === selectedCheckpointId;
              const isActive = idx === activeCheckpointIndex;
              
              return (
                <div
                  key={cp.id}
                  className="absolute bottom-1/2 flex flex-col items-center z-40"
                  style={{ left: `${leftPercent}%` }}
                >
                  {/* Inline Edit Popover */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                        className="absolute bottom-full mb-3 bg-[#121214] border border-orange-500/30 p-2 rounded-xl shadow-2xl flex items-center gap-2 z-50 min-w-max pointer-events-auto"
                        onClick={e => e.stopPropagation()}
                        onPointerDown={e => e.stopPropagation()}
                        onDoubleClick={e => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          defaultValue={cp.stateName}
                          onFocus={(e) => {
                             if (isDefaultStateName(e.target.value)) {
                                e.target.value = '';
                             }
                          }}
                          onBlur={(e) => {
                             const val = e.target.value.trim() || t.newState;
                             e.target.value = val;
                             updateCheckpointName(cp.id, val);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget.value.trim() || t.newState;
                              e.currentTarget.value = val;
                              updateCheckpointName(cp.id, val);
                              setSelectedCheckpointId(null);
                            }
                          }}
                          className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                          list={`states-${cp.id}`}
                        />
                        <datalist id={`states-${cp.id}`}>
                          {stateNameHistory.map(name => <option key={name} value={name} />)}
                        </datalist>
                        <button 
                          onClick={() => {
                            removeCheckpoint(cp.id);
                            setSelectedCheckpointId(null);
                          }}
                          className="p-1.5 text-white/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        {/* Popover Arrow */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#121214] border-b border-r border-orange-500/30 rotate-45" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* The Marker Element */}
                  <div
                    data-marker="true"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (activeTab !== 'points') return;
                      setSelectedCheckpointId(cp.id);
                      e.currentTarget.setPointerCapture(e.pointerId);
                      
                      // Start long press timer
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = setTimeout(() => {
                        setDraggingCpId(cp.id);
                        setIsLongPressed(true);
                        // Optional: trigger haptic feedback if the device supports it
                        if (window.navigator?.vibrate) {
                          window.navigator.vibrate(50);
                        }
                      }, 500);
                    }}
                    onPointerUp={() => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    onPointerLeave={() => {
                      // If we leave the marker before long press triggers, cancel it
                      if (!isLongPressed && longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className={cn(
                      "w-6 h-8 -ml-3 flex items-center justify-center transition-all duration-200 select-none touch-none",
                      activeTab === 'points' ? "cursor-ew-resize pointer-events-auto" : "cursor-default pointer-events-none opacity-50",
                      isDragging && isLongPressed ? "scale-150 z-50 -translate-y-2" : (isSelected ? "scale-110 z-50" : (activeTab === 'points' ? "hover:scale-125 z-40" : "z-40"))
                    )}
                    title={cp.stateName}
                  >
                    <div className={cn(
                      "w-2 h-6 rounded-full shadow-lg border border-black/50 overflow-hidden relative pointer-events-none transition-all",
                      isDragging && isLongPressed ? "bg-orange-500 scale-x-150" : "bg-white",
                      isSelected && "ring-2 ring-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                    )}>
                      <div className={cn(
                        "absolute inset-0 transition-all pointer-events-none",
                        isDragging && isLongPressed ? "bg-black/20" :
                        isSelected ? "bg-cyan-500" :
                        isActive ? "bg-orange-500" :
                        "bg-neutral-500 opacity-80"
                      )} />
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          </div>

          {/* Bottom Controls */}
          <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2 mt-1 pointer-events-auto">
            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
              <button 
                onClick={togglePlay} 
                className="text-white hover:text-orange-500 transition-colors pointer-events-auto shrink-0 bg-white/5 p-3 sm:p-4 rounded-full hover:bg-white/10 active:scale-95"
              >
                {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 pl-1 fill-current" />}
              </button>
              <div className="flex flex-col min-w-0">
                <span className="text-[9px] sm:text-[10px] font-black uppercase text-white/30 tracking-widest leading-none mb-1 hidden sm:block">Time</span>
                <span className="text-xs sm:text-sm font-mono font-bold text-white tracking-wider truncate">
                  {formatTime(currentTime)}<span className="text-white/30 mx-1">/</span><span className="hidden sm:inline">{formatTime(videoData.duration)}</span>
                </span>
              </div>
            </div>
            
            <div className="flex flex-1 min-w-0 items-center justify-end gap-2 sm:gap-4">
              {isExporting && (
                <div className="px-2 sm:px-4 py-1.5 sm:py-2 bg-orange-500/20 text-orange-500 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-1 sm:gap-2 pointer-events-auto shrink-0">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">Generating: </span>{Math.round(exportProgress * 100)}%
                </div>
              )}
              <div
                className="flex min-w-0 items-center gap-1.5 sm:gap-2 rounded-full border border-white/10 bg-black/45 px-2 py-1.5 sm:px-3 sm:py-2 shadow-[0_0_20px_rgba(0,0,0,0.25)] backdrop-blur-md"
                onPointerDown={stopZoomControlPropagation}
                onTouchStart={stopZoomControlPropagation}
                aria-label="シークバー縮尺 / Timeline Scale"
              >
                <button
                  type="button"
                  onClick={() => adjustZoomLevel(-0.5)}
                  className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm font-black text-white transition-colors hover:bg-white/10 active:bg-white/20 disabled:opacity-30"
                  disabled={zoomLevel <= 1}
                  aria-label="シークバーを縮小"
                >
                  −
                </button>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={zoomLevel}
                  onChange={(e) => updateZoomLevel(Number(e.currentTarget.value))}
                  onPointerDown={stopZoomControlPropagation}
                  onTouchStart={stopZoomControlPropagation}
                  className="w-16 min-w-0 accent-orange-500 sm:w-28 md:w-40"
                  aria-label="シークバー縮尺"
                />
                <button
                  type="button"
                  onClick={() => adjustZoomLevel(0.5)}
                  className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm font-black text-white transition-colors hover:bg-white/10 active:bg-white/20 disabled:opacity-30"
                  disabled={zoomLevel >= 20}
                  aria-label="シークバーを拡大"
                >
                  ＋
                </button>
                <span className="w-9 shrink-0 text-right font-mono text-[10px] font-black tabular-nums text-orange-500 sm:w-10 sm:text-xs">
                  {zoomLevel.toFixed(1)}x
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Editor Controls */}
      <div 
        className={cn(
          "flex-1 flex flex-col min-h-0 bg-[#121214] border-t landscape:border-t-0 landscape:border-l border-white/10 shrink overflow-hidden relative transition-all duration-500",
          selectedCheckpointId ? "landscape:pb-0" : "landscape:pb-24"
        )}
        onClick={() => setFocusedArea('editor')}
      >
        {/* Tabs for editing different Aspects */}
        <div className="flex border-b border-white/5 h-14 bg-[#0F0F11] shrink-0">
          <button 
            onClick={() => {
              setActiveTab('points');
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
              activeTab === 'points' ? "text-orange-500 border-b-2 border-orange-500" : "text-white/40 hover:text-white border-b-2 border-transparent"
            )}
          >
            {t.editPoints}
          </button>
          <button 
            onClick={() => {
              setActiveTab('styling');
              setSelectedCheckpointId(null);
            }}
            className={cn(
               "flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
               activeTab === 'styling' ? "text-orange-500 border-b-2 border-orange-500" : "text-white/40 hover:text-white border-b-2 border-transparent"
            )}
          >
            {t.styling}
          </button>
          <button 
            onClick={() => setShowExporter(true)}
            className="flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 hover:text-emerald-400 border-b-2 border-transparent"
          >
            Export
          </button>
        </div>

        {/* Tab Content */}
        <div className={cn(
          "flex-1 overflow-y-auto transition-all duration-500",
          selectedCheckpointId ? "p-3 space-y-2" : "p-6 space-y-4"
        )}>
          {activeTab === 'points' && (
            <>
              <div className={cn(
                "flex justify-between items-center",
                selectedCheckpointId ? "mb-1" : "mb-2"
              )}>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Registry</h3>
                <button 
                  onClick={addCheckpointAtCurrentTime}
                  className="flex items-center gap-2 text-[9px] bg-orange-500 text-black px-3 py-1.5 rounded font-black uppercase tracking-widest shadow-lg shadow-orange-500/10 hover:bg-orange-600 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Insert Marker
                </button>
              </div>


              {[...videoData.checkpoints].sort((a, b) => a.time - b.time).map((cp, idx, arr) => (
                <Fragment key={cp.id}>
                  <div 
                    className={cn(
                      "group flex items-center transition-all shrink-0 cursor-pointer outline-none rounded-xl border",
                      selectedCheckpointId ? "gap-2 p-2" : "gap-4 p-4",
                      idx === activeCheckpointIndex 
                        ? "bg-orange-500/10 border-orange-500/50 shadow-2xl scale-[1.02]" 
                        : "bg-white/5 border-white/5 hover:border-white/10 focus-within:border-orange-500/50"
                    )}
                    tabIndex={0}
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = cp.time / 1000;
                        setCurrentTime(cp.time);
                      }
                    }}
                    onFocus={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = cp.time / 1000;
                        setCurrentTime(cp.time);
                      }
                    }}
                  >
                    <div className={cn(
                      "flex flex-col items-center justify-center w-10 h-10 rounded-lg text-sm font-black transition-colors shrink-0",
                      idx === activeCheckpointIndex ? "bg-orange-500 text-black" : "bg-black/30 text-white/20"
                    )}>
                      {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          "text-[10px] font-mono font-bold tracking-widest",
                          idx === activeCheckpointIndex ? "text-orange-500" : "text-white/40"
                        )}>{formatTime(cp.time)}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeCheckpoint(cp.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-rose-500 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {editingCheckpointId === cp.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            autoFocus
                            defaultValue={cp.stateName}
                            onFocus={(e) => {
                               if (isDefaultStateName(e.target.value)) {
                                  e.target.value = '';
                               }
                            }}
                            onBlur={(e) => {
                               const val = e.target.value.trim() || t.newState;
                               e.target.value = val;
                               updateCheckpointName(cp.id, val);
                            }}
                            onKeyDown={(e) => {
                               if (e.key === 'Enter') {
                                  const val = e.currentTarget.value.trim() || t.newState;
                                  e.currentTarget.value = val;
                                  updateCheckpointName(cp.id, val);
                               }
                            }}
                            className="w-full bg-black border border-white/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                            list={`states-${cp.id}`}
                          />
                          <datalist id={`states-${cp.id}`}>
                            {stateNameHistory.map(name => <option key={name} value={name} />)}
                          </datalist>
                        </div>
                      ) : (
                        <div 
                          onClick={() => setEditingCheckpointId(cp.id)}
                          className={cn(
                            "text-sm font-bold truncate cursor-text transition-colors",
                            idx === activeCheckpointIndex ? "text-white" : "text-slate-300 hover:text-white"
                          )}
                        >
                          {cp.stateName}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const sorted = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
                          const i = sorted.findIndex(c => c.id === cp.id);
                          if (i > 0) {
                            const next = [...sorted];
                            next[i].time = Math.max(0, next[i].time - 500);
                            onUpdateCheckpoints(next);
                          }
                        }}
                        className="p-1.5 bg-black/40 rounded-md text-white/40 hover:text-white"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const sorted = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
                          const i = sorted.findIndex(c => c.id === cp.id);
                          if (i < sorted.length) {
                            const next = [...sorted];
                            next[i].time = Math.min(videoData.duration, next[i].time + 500);
                            onUpdateCheckpoints(next);
                          }
                        }}
                        className="p-1.5 bg-black/40 rounded-md text-white/40 hover:text-white"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {idx < arr.length - 1 && (
                    <div className="flex flex-col items-center py-2 relative">
                      <div className="w-px h-4 bg-white/10" />
                      
                      {editingSpeedUpId === cp.id ? (
                        <div className="w-full bg-neutral-800/80 border border-neutral-700 p-4 rounded-xl my-2 shadow-xl">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 mb-4">
                            {t.ffSettings}
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">{t.speedMult}</label>
                              <div className="flex gap-2">
                                {[2, 3, 5, 10].map(speed => (
                                  <button
                                    key={speed}
                                    onClick={() => updateSpeedUpConfig(cp.id, { multiplier: speed, delaySeconds: cp.speedUp?.delaySeconds || 0 })}
                                    className={cn(
                                      "flex-1 py-2 rounded border text-xs font-bold transition-colors",
                                      cp.speedUp?.multiplier === speed 
                                        ? "bg-orange-500 border-orange-500 text-black" 
                                        : "bg-black/50 border-white/10 text-white hover:border-white/30"
                                    )}
                                  >
                                    {speed}x
                                  </button>
                                ))}
                              </div>
                            </div>
                            
                              <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">{t.delaySec}</label>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="100" 
                                  step="1"
                                  value={tempDelayValue}
                                  onFocus={(e) => {
                                    if (tempDelayValue === "0") {
                                      setTempDelayValue("");
                                    }
                                  }}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setTempDelayValue(val);
                                    const parsed = parseFloat(val);
                                    if (!isNaN(parsed)) {
                                      updateSpeedUpConfig(cp.id, { 
                                        multiplier: cp.speedUp?.multiplier || 2, 
                                        delaySeconds: parsed
                                      });
                                    }
                                  }}
                                  onBlur={() => {
                                    if (tempDelayValue === "" || isNaN(parseFloat(tempDelayValue))) {
                                      setTempDelayValue("0");
                                      updateSpeedUpConfig(cp.id, { 
                                        multiplier: cp.speedUp?.multiplier || 2, 
                                        delaySeconds: 0
                                      });
                                    }
                                  }}
                                  className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                                />
                              </div>
                          </div>

                          <div className="flex items-center gap-2 mt-6">
                            <button 
                              onClick={() => setEditingSpeedUpId(null)}
                              className="flex-1 py-3 bg-white hover:bg-neutral-200 text-black rounded-lg text-xs font-black uppercase tracking-widest transition-colors"
                            >
                              {t.done}
                            </button>
                            <button 
                              onClick={() => {
                                updateSpeedUpConfig(cp.id, undefined);
                                setEditingSpeedUpId(null);
                              }}
                              className="py-3 px-4 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-colors group relative"
                              title={t.rmFf}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 group/speedup relative">
                          <button 
                            onClick={() => setEditingSpeedUpId(cp.id)} 
                            className={cn(
                              "z-10 bg-[#121212] border border-white/10 shadow-lg rounded-full flex items-center justify-center p-2 transition-all hover:scale-110",
                              cp.speedUp ? "text-orange-500 border-orange-500/30" : "text-white/20 hover:text-orange-500 hover:border-orange-500/30"
                            )}
                          >
                            <Scissors className="w-3.5 h-3.5" />
                          </button>
                          {cp.speedUp && (
                            <div className="absolute left-10 top-1/2 -translate-y-1/2 whitespace-nowrap bg-orange-500/10 text-orange-500 border border-orange-500/20 px-2 py-1 rounded text-[10px] font-bold">
                              {cp.speedUp.multiplier}x (Wait {cp.speedUp.delaySeconds}s)
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="w-px h-4 bg-white/10" />
                    </div>
                  )}
                </Fragment>
              ))}

              {videoData.checkpoints.length === 0 && (
                <div className="py-12 text-center">
                  <Pin className="w-12 h-12 mx-auto mb-4 text-white/5" />
                  <p className="text-[10px] uppercase font-black tracking-widest text-white/20">NO DATA POINTS</p>
                </div>
              )}

              {/* Stats Summary */}
              {totalCycleTime > 0 && (
                <div className="mt-8 p-6 rounded-2xl bg-orange-500/5 border border-orange-500/20 text-center shadow-inner">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500/60 block mb-2">
                    {t.totalTime}
                  </span>
                  <span className="text-4xl font-bold tracking-tighter text-white">
                    {formatTime(totalCycleTime)}
                  </span>
                </div>
              )}
            </>
          )}

          {activeTab === 'styling' && (
            <div className="space-y-8 max-w-sm mx-auto pt-4 pb-20">
              <div className="flex gap-2 p-1 bg-black/40 rounded-xl mb-6">
                {(['title', 'panel', 'time'] as const).map(el => (
                  <button 
                    key={el}
                    onClick={() => setSelectedOverlayElement(el)}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors", 
                      selectedOverlayElement === el ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                    )}
                  >
                    {el === 'title' ? t.title : el === 'panel' ? t.panel : t.time}
                  </button>
                ))}
              </div>

              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-6 text-center">Overlay Configuration</h3>
                <div className="space-y-6">
                  {selectedOverlayElement === 'title' && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 block text-center">Title Text</label>
                      <input 
                        type="text"
                        value={overlayConfig.titleText || ''}
                        onChange={(e) => setOverlayConfig({ ...overlayConfig, titleText: e.target.value })}
                        className="w-full bg-black/30 border border-white/5 rounded-2xl p-4 text-center text-white font-bold outline-none focus:border-orange-500/50 transition-colors"
                        placeholder={t.egWorkProcess}
                      />
                    </div>
                  )}
                  
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 block text-center">Width</label>
                    <div className="flex items-center gap-4 bg-black/30 p-2 rounded-2xl border border-white/5">
                      <input 
                        type="range" min="100" max="800" step="10" 
                        value={currentStyle.width || 320}
                        onChange={e => updateStyle({ width: parseInt(e.target.value) })}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="font-mono text-xs w-12 text-right">{currentStyle.width || 320}px</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 block text-center">Height</label>
                    <div className="flex items-center gap-4 bg-black/30 p-2 rounded-2xl border border-white/5">
                      <input 
                        type="range" min="50" max="600" step="10" 
                        value={currentStyle.height || 160}
                        onChange={e => updateStyle({ height: parseInt(e.target.value) })}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="font-mono text-xs w-12 text-right">{currentStyle.height || 160}px</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 block text-center">Scale</label>
                    <div className="flex items-center gap-4 bg-black/30 p-2 rounded-2xl border border-white/5">
                      <input 
                        type="range" min="0.1" max="3" step="0.1" 
                        value={currentStyle.scale}
                        onChange={e => updateStyle({ scale: parseFloat(e.target.value) })}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="font-mono text-xs w-12 text-right">{Math.round(currentStyle.scale * 100)}%</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 block text-center">Font Size</label>
                    <div className="flex items-center gap-4 bg-black/30 p-2 rounded-2xl border border-white/5">
                      <input 
                        type="range" min="10" max="100" step="1" 
                        value={currentStyle.fontSize}
                        onChange={e => updateStyle({ fontSize: parseInt(e.target.value) })}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="font-mono text-xs w-12 text-right">{currentStyle.fontSize}px</span>
                    </div>
                  </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] text-center text-white/30 uppercase tracking-[0.2em] font-black block mb-2">Text Color</label>
                        <div className="flex items-center justify-center gap-2 bg-black/30 p-2 rounded-2xl border border-white/5">
                          <input 
                            type="color" 
                            value={currentStyle.textColor} 
                            onChange={(e) => updateStyle({ textColor: e.target.value })}
                            className="w-full h-8 rounded cursor-pointer border border-white/10 p-0.5 bg-black/50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-center text-white/30 uppercase tracking-[0.2em] font-black block mb-2">Background Color</label>
                        <div className="flex items-center justify-center gap-2 bg-black/30 p-2 rounded-2xl border border-white/5">
                          <input 
                            type="color" 
                            value={currentStyle.bgColor} 
                            onChange={(e) => updateStyle({ bgColor: e.target.value })}
                            className="w-full h-8 rounded cursor-pointer border border-white/10 p-0.5 bg-black/50"
                          />
                        </div>
                      </div>
                    </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 block text-center">Background Opacity</label>
                    <div className="flex items-center gap-4 bg-black/30 p-2 rounded-2xl border border-white/5">
                      <input 
                        type="range" min="0" max="1" step="0.1" 
                        value={currentStyle.bgOpacity}
                        onChange={e => updateStyle({ bgOpacity: parseFloat(e.target.value) })}
                        className="flex-1 accent-orange-500"
                      />
                      <span className="font-mono text-xs w-12 text-right">{Math.round(currentStyle.bgOpacity * 100)}%</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 block text-center">Font</label>
                    <select 
                      value={currentStyle.fontFamily}
                      onChange={e => updateStyle({ fontFamily: e.target.value })}
                      className="w-full bg-black/30 border border-white/5 rounded-2xl p-4 text-center text-white font-bold outline-none focus:border-orange-500/50 transition-colors"
                    >
                      <option value='"SF Pro Text", -apple-system, system-ui, sans-serif'>Default Sans</option>
                      <option value='ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'>Monospace</option>
                      <option value='Georgia, serif'>Serif</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="pt-8 border-t border-white/5 space-y-4">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-4 text-center">Positioning</h3>
                 <div 
                   className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center shadow-inner cursor-move touch-none"
                   onPointerDown={handleTrackpadPointerDown}
                 >
                   <Move className="w-8 h-8 text-orange-500/50 mx-auto mb-3" />
                   <p className="text-xs text-orange-500/80 leading-relaxed font-bold">
                     {t.overlayHint}
                   </p>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Modal Placeholder */}
      <AnimatePresence>
        {showExporter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => setShowExporter(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#121214] rounded-3xl p-8 border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
            >
              <h3 className="text-xl font-black uppercase tracking-tighter mb-2">Generate Output</h3>
              <p className="text-sm text-white/40 mb-8 leading-relaxed">
                {t.exportDesc}
              </p>
              
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center py-3 border-b border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Resolution</span>
                  <span className="text-sm font-bold text-right text-white">{t.matchSource}<br/><span className="text-xs text-white/50 font-normal">{t.matchSourceDesc}</span></span>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button 
                  className="w-full py-4 bg-neutral-800 border border-neutral-700 text-white rounded-xl font-black uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-1 hover:bg-neutral-700 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => {
                    setShowExporter(false);
                    startExport('overlayOnly');
                  }}
                  disabled={isExporting}
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-orange-500" />
                    {t.transparentExport}
                  </div>
                  <span className="text-[9px] text-white/40 font-normal normal-case">{t.transparentExportDesc}</span>
                </button>

                <button 
                  className="w-full py-4 bg-orange-500 text-black rounded-xl font-black uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-1 hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => {
                    setShowExporter(false);
                    startExport('composite');
                  }}
                  disabled={isExporting}
                >
                   <div className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    {t.mp4Export}
                  </div>
                  <span className="text-[9px] text-black/60 font-normal normal-case">{t.mp4ExportDesc}</span>
                </button>

                <div className="w-full h-px bg-white/5 my-2" />

                <button 
                  className="w-full py-4 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl font-black uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-1 hover:bg-blue-500/30 hover:border-blue-500/50 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => {
                    exportCSV();
                    setShowExporter(false);
                  }}
                  disabled={isExporting}
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    {t.exportCsv}
                  </div>
                </button>

                <div className="w-full h-px bg-white/5 my-2" />

                <button 
                  className="w-full py-4 bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded-xl font-black uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-1 hover:bg-teal-500/30 hover:border-teal-500/50 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => saveProject()}
                  disabled={isExporting}
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    {t.saveProject}
                  </div>
                  <span className="text-[9px] text-teal-400/50 font-normal normal-case">{t.saveProjectDesc}</span>
                </button>

                <button 
                  className="w-full py-4 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl font-black uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-1 hover:bg-indigo-500/30 hover:border-indigo-500/50 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExporting}
                >
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    {t.loadProject}
                  </div>
                  <span className="text-[9px] text-indigo-400/50 font-normal normal-case">{t.loadProjectDesc}</span>
                  <input 
                    type="file" 
                    accept=".zip,.json" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={loadProject} 
                  />
                </button>

                <button 
                  className="w-full py-4 text-white/20 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors mt-2"
                  onClick={() => setShowExporter(false)}
                >
                  Return to editor
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Edit Point Overlay */}
      <AnimatePresence>
        {selectedCheckpointId && (
          <motion.div
            drag
            dragConstraints={stageRef}
            dragElastic={0.05}
            dragMomentum={false}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 right-4 z-50 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-col gap-1.5 shadow-2xl pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-[220px] touch-none cursor-grab active:cursor-grabbing"
          >
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-1 shrink-0" />
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">{t.editPoint}</span>
                <span className="text-white font-bold truncate">
                  {videoData.checkpoints.find(c => c.id === selectedCheckpointId)?.stateName}
                </span>
              </div>
              <button 
                onClick={() => setSelectedCheckpointId(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Plus className="w-5 h-5 rotate-45 text-white/40" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <button 
                  onClick={() => {
                    const cp = videoData.checkpoints.find(c => c.id === selectedCheckpointId);
                    if (cp) {
                      const newTime = Math.max(0, cp.time - 100);
                      onUpdateCheckpoints(videoData.checkpoints.map(c => c.id === selectedCheckpointId ? { ...c, time: newTime } : c));
                      if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
                      setCurrentTime(newTime);
                    }
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-all py-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center"
                >
                  <span className="text-[10px] font-black text-white/40 mb-1">-100ms</span>
                  <ChevronDown className="w-4 h-4 rotate-90 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const cp = videoData.checkpoints.find(c => c.id === selectedCheckpointId);
                    if (cp) {
                      const newTime = Math.max(0, cp.time - 10);
                      onUpdateCheckpoints(videoData.checkpoints.map(c => c.id === selectedCheckpointId ? { ...c, time: newTime } : c));
                      if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
                      setCurrentTime(newTime);
                    }
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-all py-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center"
                >
                  <span className="text-[10px] font-black text-white/40 mb-1">-10ms</span>
                  <ChevronDown className="w-3 h-3 rotate-90 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const cp = videoData.checkpoints.find(c => c.id === selectedCheckpointId);
                    if (cp) {
                      const newTime = Math.min(videoData.duration, cp.time + 10);
                      onUpdateCheckpoints(videoData.checkpoints.map(c => c.id === selectedCheckpointId ? { ...c, time: newTime } : c));
                      if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
                      setCurrentTime(newTime);
                    }
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-all py-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center"
                >
                  <span className="text-[10px] font-black text-white/40 mb-1">+10ms</span>
                  <ChevronUp className="w-3 h-3 rotate-90 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const cp = videoData.checkpoints.find(c => c.id === selectedCheckpointId);
                    if (cp) {
                      const newTime = Math.min(videoData.duration, cp.time + 100);
                      onUpdateCheckpoints(videoData.checkpoints.map(c => c.id === selectedCheckpointId ? { ...c, time: newTime } : c));
                      if (videoRef.current) videoRef.current.currentTime = newTime / 1000;
                      setCurrentTime(newTime);
                    }
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 active:bg-white/20 transition-all py-1.5 rounded-xl border border-white/5 flex flex-col items-center justify-center"
                >
                  <span className="text-[10px] font-black text-white/40 mb-1">+100ms</span>
                  <ChevronUp className="w-4 h-4 rotate-90 text-white" />
                </button>
              </div>

              <div className="flex gap-1.5">
                <button 
                  onClick={() => {
                     const currentIdx = sortedCheckpoints.findIndex(c => c.id === selectedCheckpointId);
                     if (currentIdx > 0) {
                        const prevCp = sortedCheckpoints[currentIdx - 1];
                        setSelectedCheckpointId(prevCp.id);
                        if (videoRef.current) videoRef.current.currentTime = prevCp.time / 1000;
                        setCurrentTime(prevCp.time);
                     }
                  }}
                  disabled={sortedCheckpoints.findIndex(c => c.id === selectedCheckpointId) <= 0}
                  className="flex-1 py-1.5 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-20 flex items-center justify-center gap-2"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                  {t.prev}
                </button>
                <button 
                  onClick={() => {
                     const currentIdx = sortedCheckpoints.findIndex(c => c.id === selectedCheckpointId);
                     if (currentIdx >= 0 && currentIdx < sortedCheckpoints.length - 1) {
                        const nextCp = sortedCheckpoints[currentIdx + 1];
                        setSelectedCheckpointId(nextCp.id);
                        if (videoRef.current) videoRef.current.currentTime = nextCp.time / 1000;
                        setCurrentTime(nextCp.time);
                     }
                  }}
                  disabled={sortedCheckpoints.findIndex(c => c.id === selectedCheckpointId) === sortedCheckpoints.length - 1}
                  className="flex-1 py-1.5 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-20 flex items-center justify-center gap-2"
                >
                  {t.next}
                  <ChevronUp className="w-4 h-4 rotate-90" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
