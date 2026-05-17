import { Directory, Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { useState, RefObject } from 'react';
import { VideoData } from '../types';

const CAPACITOR_SAVE_DIRECTORIES = [Directory.Documents, Directory.ExternalStorage];

const VIDEO_MIME_TYPES = [
  'video/webm;codecs=vp8',
  'video/webm',
  'video/webm;codecs=vp9',
  'video/webm;codecs=h264',
  'video/mp4',
];

const formatExportTimestamp = () => {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');

  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const selectVideoMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  return VIDEO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('動画データを Base64 に変換できませんでした。'));
        return;
      }

      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('動画データの読み込みに失敗しました。'));
    reader.readAsDataURL(blob);
  });

const saveVideoBlob = async (blob: Blob, extension: string) => {
  const fileName = `exported-video-${formatExportTimestamp()}.${extension}`;

  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    let lastError: unknown;

    for (const directory of CAPACITOR_SAVE_DIRECTORIES) {
      try {
        const result = await Filesystem.writeFile({
          path: fileName,
          data,
          directory,
        });

        alert(`動画を保存しました: ${fileName}`);
        return result.uri;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('動画の保存に失敗しました。');
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
  alert(`動画のダウンロードを開始しました: ${fileName}`);

  return url;
};

export function useVideoExport(
  videoRef: RefObject<HTMLVideoElement>,
  containerRef: RefObject<HTMLDivElement>,
  videoData: VideoData,
  overlayConfig: any,
  totalCycleTime: number
) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const startExport = async (exportMode: 'composite' | 'overlayOnly' = 'composite') => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    setIsExporting(true);
    setExportProgress(0);

    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0';
    canvas.style.zIndex = '-9999';
    document.body.appendChild(canvas);

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        setIsExporting(false);
        return;
    }

    const canvasStream = canvas.captureStream(30); 
    
    let audioTracks: MediaStreamTrack[] = [];
    try {
      const videoStream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null;
      if (videoStream) {
        audioTracks = videoStream.getAudioTracks();
      }
    } catch(e) {}

    audioTracks.forEach(track => canvasStream.addTrack(track));

    const mimeType = selectVideoMimeType();
    const options = mimeType ? { mimeType } : undefined;
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

    const mediaRecorder = new MediaRecorder(canvasStream, options);
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }

      try {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        await saveVideoBlob(blob, ext);
      } catch (error) {
        console.error('Failed to save exported video', error);
        alert('動画の保存に失敗しました。もう一度お試しください。');
      } finally {
        setIsExporting(false);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder failed during export', event);
      alert('動画の書き出し中にエラーが発生しました。');
      setIsExporting(false);
    };

    const originalTime = video.currentTime;
    const originalPlaybackRate = video.playbackRate;
    video.currentTime = 0;
    video.playbackRate = 1.0;
    
    await video.play();
    mediaRecorder.start();

    const formatTime = (timeMs: number) => {
      if (timeMs < 0) timeMs = 0;
      const timeSec = timeMs / 1000;
      const minutes = Math.floor(timeSec / 60);
      const seconds = Math.floor(timeSec % 60);
      const ms = Math.floor((timeSec % 1) * 100);
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    
    // Using simple proportional mapping since container perfectly sizes to video aspect.
    // 1024 is the baseline width used in EditorView for font / panel sizes.
    const maxDim = Math.max(vWidth, vHeight);
    const coordScale = maxDim / 1024;

    const getX = (pct: number) => (pct / 100) * vWidth;
    const getY = (pct: number) => (pct / 100) * vHeight;

    let isStopped = false;
    let overlayStartTime = performance.now();

    const drawFrame = (now?: number, metadata?: any) => {
      if (isStopped) return;
      
      let t = 0;
      if (exportMode === 'composite') {
        t = (metadata ? metadata.mediaTime : video.currentTime) * 1000;
        if (video.ended || t >= video.duration * 1000 - 100) {
          isStopped = true;
          mediaRecorder.stop();
          video.pause();
          video.currentTime = originalTime;
          video.playbackRate = originalPlaybackRate;
          return;
        }
      } else {
        t = performance.now() - overlayStartTime;
        if (t >= video.duration * 1000) {
          isStopped = true;
          mediaRecorder.stop();
          return;
        }
      }

      ctx.clearRect(0, 0, width, height);
      if (exportMode === 'composite') {
        ctx.drawImage(video, 0, 0, width, height);
      }

      setExportProgress(t / (video.duration * 1000));

      const title = overlayConfig.title;
      if (title) {
        ctx.save();
        ctx.translate(getX(title.x), getY(title.y));
        ctx.scale(title.scale, title.scale);
        
        ctx.textBaseline = 'top';

        const fSize = title.fontSize * coordScale;
        
        ctx.font = `900 ${fSize}px ${title.fontFamily || 'Inter'}`;
        const mt2 = ctx.measureText(overlayConfig.titleText);
        
        const w = mt2.width;
        const h = fSize;
        
        const padX = 16 * coordScale;
        const padY = 16 * coordScale;
        const totalW = w + padX * 2;
        const totalH = h + padY * 2;

        ctx.translate(-totalW / 2, -totalH / 2);

        if (title.bgOpacity > 0) {
            ctx.fillStyle = title.bgColor;
            ctx.globalAlpha = title.bgOpacity;
            ctx.beginPath();
            ctx.roundRect(0, 0, totalW, totalH, 4 * coordScale);
            ctx.fill();
        }
        
        ctx.globalAlpha = 1;
        ctx.fillStyle = title.textColor;
        ctx.font = `900 ${fSize}px ${title.fontFamily || 'Inter'}`;
        ctx.fillText(overlayConfig.titleText, padX, padY);
        ctx.restore();
      }

      const timeCfg = overlayConfig.time;
      if (timeCfg) {
        ctx.save();
        ctx.translate(getX(timeCfg.x), getY(timeCfg.y));
        ctx.scale(timeCfg.scale, timeCfg.scale);
        
        ctx.textBaseline = 'top';

        let currentTotalTime = 0;
        const sorted = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
        if (sorted.length > 0) {
          const startTime = sorted[0].time;
          if (t >= startTime) {
            if (sorted.length >= 2 && t > sorted[sorted.length - 1].time) {
              currentTotalTime = sorted[sorted.length - 1].time - startTime;
            } else {
              currentTotalTime = t - startTime;
            }
          }
        }

        const timeStr = formatTime(currentTotalTime);
        const labelStr = "TOTAL TIME";
        
        const fSize = timeCfg.fontSize * coordScale;
        const lSize = 10 * coordScale;
        const gap = 4 * coordScale;

        ctx.font = `900 ${lSize}px ${timeCfg.fontFamily || 'Inter'}`;
        const labelMetrics = ctx.measureText(labelStr);

        ctx.font = `bold ${fSize}px monospace`;
        const timeMetrics = ctx.measureText(timeStr);

        const w = Math.max(labelMetrics.width, timeMetrics.width);
        const totalH = lSize + gap + fSize;

        const padX = 16 * coordScale;
        const padY = 16 * coordScale;
        const boxW = w + padX * 2;
        const boxH = totalH + padY * 2;

        ctx.translate(-boxW / 2, -boxH / 2);

        if (timeCfg.bgOpacity > 0) {
            ctx.fillStyle = timeCfg.bgColor;
            ctx.globalAlpha = timeCfg.bgOpacity;
            ctx.beginPath();
            ctx.roundRect(0, 0, boxW, boxH, 8 * coordScale);
            ctx.fill();
        }
        
        ctx.textAlign = 'center';
        const centerX = boxW / 2;

        ctx.globalAlpha = 0.6;
        ctx.fillStyle = timeCfg.textColor;
        ctx.font = `900 ${lSize}px ${timeCfg.fontFamily || 'Inter'}`;
        ctx.fillText(labelStr, centerX, padY);

        ctx.globalAlpha = 1;
        ctx.fillStyle = timeCfg.textColor;
        ctx.font = `bold ${fSize}px monospace`;
        ctx.fillText(timeStr, centerX, padY + lSize + gap);
        ctx.restore();
      }

      const sortedCheckpoints = [...videoData.checkpoints].sort((a, b) => a.time - b.time);
      const activeIndex = sortedCheckpoints.findIndex((cp, i) => {
        const nextTime = sortedCheckpoints[i + 1]?.time || Infinity;
        return t >= cp.time && t < nextTime;
      });

      const panel = overlayConfig.panel;
      if (panel) {
        ctx.save();
        ctx.translate(getX(panel.x), getY(panel.y));
        ctx.scale(panel.scale, panel.scale);

        const pWidth = (panel.width || 320) * coordScale;
        const pHeight = (panel.height || 160) * coordScale;

        ctx.translate(-pWidth / 2, -pHeight / 2);

        if (panel.bgOpacity > 0) {
            ctx.fillStyle = panel.bgColor;
            ctx.globalAlpha = panel.bgOpacity;
            ctx.beginPath();
            ctx.roundRect(0, 0, pWidth, pHeight, 16 * coordScale);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        
        const visibleIndices = [];
        if (activeIndex > 0) visibleIndices.push(activeIndex - 1);
        if (activeIndex >= 0) visibleIndices.push(activeIndex);
        if (activeIndex < sortedCheckpoints.length - 1 && activeIndex >= 0) visibleIndices.push(activeIndex + 1);
        else if (activeIndex === -1 && sortedCheckpoints.length > 0) visibleIndices.push(0);

        const activeCpTime = activeIndex >= 0 ? sortedCheckpoints[activeIndex].time : -Infinity;
        const dt = t - activeCpTime; 
        const animProgress = dt >= 0 && dt < 500 ? 1 - Math.pow(1 - (dt / 500), 3) : 1; 

        const spaceBase = 25 * coordScale;
        const spaceActive = 35 * coordScale;

        let yOffset = pHeight / 2 - (visibleIndices.length * (activeIndex >= 0 ? spaceActive : spaceBase));

        if (animProgress < 1 && activeIndex > 0) {
           yOffset += (pHeight * 0.25 + 4 * coordScale) * (1 - animProgress);
        }

        visibleIndices.forEach((idx) => {
            const cp = sortedCheckpoints[idx];
            const isActive = idx === activeIndex;
            const isPrev = idx < activeIndex;

            const boxHeight = isActive ? pHeight * 0.35 : pHeight * 0.25;
            const boxPadding = isActive ? 16 * coordScale : 12 * coordScale;
            
            ctx.save();
            ctx.translate(16 * coordScale, yOffset);
            
            ctx.fillStyle = isActive ? 'rgba(249, 115, 22, 0.1)' : 'rgba(38, 38, 38, 0.8)';
            ctx.strokeStyle = isActive ? 'rgba(249, 115, 22, 0.4)' : 'rgba(64, 64, 64, 0.5)';
            ctx.lineWidth = 1 * coordScale;
            
            ctx.beginPath();
            ctx.roundRect(0, 0, pWidth - 32 * coordScale, boxHeight, 12 * coordScale);
            ctx.fill();
            ctx.stroke();

            const activeColor = panel.textColor;
            const inactiveColor = 'rgba(156, 163, 175, 1)';
            
            ctx.fillStyle = isActive ? activeColor : inactiveColor;
            const baseFontSize = panel.fontSize * coordScale;
            const fontSize = isActive ? baseFontSize + 2 * coordScale : Math.max(10 * coordScale, baseFontSize - 4 * coordScale);
            
            ctx.font = `900 ${fontSize}px ${panel.fontFamily || 'Inter'}`;
            ctx.textBaseline = 'middle';
            
            const numStr = (idx + 1 < 10 ? `0${idx + 1}` : idx + 1).toString();
            ctx.globalAlpha = isActive ? 1 : 0.5;
            ctx.fillText(numStr, boxPadding, boxHeight / 2);

            ctx.globalAlpha = isActive ? 1 : 0.8;
            const boldSize = isActive ? baseFontSize + 4 * coordScale : fontSize;
            ctx.font = `${isActive ? 'bold' : 'italic bold'} ${boldSize}px ${panel.fontFamily || 'Inter'}`;
            
            ctx.fillText(cp.stateName, boxPadding + 30 * coordScale, boxHeight / 2, pWidth - 120 * coordScale);

            let stateDuration = 0;
            if (isActive) {
              stateDuration = t - cp.time;
            } else if (isPrev) {
              const nextTime = sortedCheckpoints[idx + 1]?.time;
              stateDuration = (nextTime || t) - cp.time;
            } else {
              stateDuration = cp.time;
            }

            ctx.globalAlpha = 1;
            
            ctx.font = `bold ${boldSize}px monospace`;
            ctx.textAlign = 'right';
            
            ctx.globalAlpha = isActive ? 1 : 0.7;
            ctx.fillText(formatTime(stateDuration), pWidth - 32 * coordScale - boxPadding, boxHeight / 2 + (isActive ? 4 * coordScale : 0));
            
            if (isActive) {
              ctx.font = `900 ${10 * coordScale}px ${panel.fontFamily || 'Inter'}`;
              ctx.globalAlpha = 0.6;
              ctx.fillText("STATE TIME", pWidth - 32 * coordScale - boxPadding, boxHeight / 2 - 12 * coordScale);
            } else {
              ctx.font = `900 ${8 * coordScale}px ${panel.fontFamily || 'Inter'}`;
              ctx.globalAlpha = 0.5;
              ctx.fillText(isPrev ? "DURATION" : "START TIME", pWidth - 32 * coordScale - boxPadding, boxHeight / 2 - 10 * coordScale);
            }

            ctx.restore();
            yOffset += boxHeight + 4 * coordScale;
        });

        ctx.restore();
      }

      if (exportMode === 'composite') {
        if ((video as any).requestVideoFrameCallback) {
            (video as any).requestVideoFrameCallback(drawFrame);
        } else {
            requestAnimationFrame(() => drawFrame());
        }
      } else {
        requestAnimationFrame(() => drawFrame());
      }
    };

    if (exportMode === 'composite') {
      if ((video as any).requestVideoFrameCallback) {
          (video as any).requestVideoFrameCallback(drawFrame);
      } else {
          requestAnimationFrame(() => drawFrame());
      }
    } else {
      overlayStartTime = performance.now();
      requestAnimationFrame(() => drawFrame());
    }
  };

  return { isExporting, exportProgress, startExport };
}
