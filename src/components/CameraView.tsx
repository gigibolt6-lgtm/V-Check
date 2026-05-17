import { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Pin, RefreshCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatTime, cn } from '../lib/utils';
import { Checkpoint } from '../types';
import { useTranslation } from '../i18n';

interface CameraViewProps {
  onVideoReady: (url: string, duration: number, checkpoints: Checkpoint[]) => void;
  stateNameHistory: string[];
}

export default function CameraView({ onVideoReady, stateNameHistory }: CameraViewProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const checkpointsRef = useRef<Checkpoint[]>([]);

  // Update ref whenever checkpoints state changes, to avoid stale closure issue in onstop
  useEffect(() => {
    checkpointsRef.current = checkpoints;
  }, [checkpoints]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<'initializing' | 'ready' | 'error' | 'denied'>('initializing');
  const [errorMsg, setErrorMsg] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    let initTimeout: number;

    const initCamera = async () => {
      setStatus('initializing');
      setErrorMsg('');
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(t.camUnsupported);
        }

        // Simplify constraints for maximum compatibility
        const constraints = {
          video: { 
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: true
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!mounted) {
          // If unmounted while waiting for user permission, stop constraints
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus('ready');
      } catch (err: any) {
        if (!mounted) return;
        console.error("Camera access error:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('denied')) {
          setStatus('denied');
          setErrorMsg(t.camDenied);
        } else if (err.name === 'OverconstrainedError') {
          // Fallback for strict resolution requirements
          try {
            const simpleStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (!mounted) {
              simpleStream.getTracks().forEach(track => track.stop());
              return;
            }
            if (videoRef.current) {
              videoRef.current.srcObject = simpleStream;
              setStatus('ready');
            }
          } catch (retryErr: any) {
            if (!mounted) return;
            setStatus('error');
            setErrorMsg(t.camNotFound);
          }
        } else {
          setStatus('error');
          setErrorMsg(err.message || t.camError);
        }
      }
    };

    // Delay avoids double-prompting in React 18 Strict Mode
    initTimeout = window.setTimeout(() => {
      if (mounted) initCamera();
    }, 200);

    return () => {
      mounted = false;
      clearTimeout(initTimeout);
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [facingMode, retryCount]);

  const handleRetry = () => setRetryCount(c => c + 1);

  const getSupportedMimeType = () => {
    const types = [
      'video/mp4;codecs=h264',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startRecording = () => {
    if (!videoRef.current?.srcObject || status !== 'ready') return;
    
    chunksRef.current = [];
    const stream = videoRef.current.srcObject as MediaStream;
    const mimeType = getSupportedMimeType();
    
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const duration = Date.now() - startTimeRef.current;
        onVideoReady(url, duration, checkpointsRef.current);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setCheckpoints([]);
      setElapsedTime(0);
      startTimeRef.current = Date.now();
      
      timerRef.current = window.setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      console.error("Recording start error:", err);
      alert(t.recordFail);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  };

  const addCheckpoint = () => {
    const now = Date.now() - startTimeRef.current;
    const newCheckpoint: Checkpoint = {
      id: Math.random().toString(36).substr(2, 9),
      time: now,
      stateName: t.newState
    };
    setCheckpoints(prev => [...prev, newCheckpoint]);
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="relative h-full bg-[#0A0A0B] overflow-hidden flex flex-col landscape:flex-row">
      {/* Camera Preview Area */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn("w-full h-full object-cover", status !== 'ready' && "hidden")}
        />
        
        {status !== 'ready' && (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            {status === 'initializing' && (
              <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            )}
            {status === 'denied' && (
              <>
                <AlertCircle className="w-16 h-16 text-rose-500 opacity-50" />
                <h3 className="text-lg font-bold uppercase tracking-tight">Camera Permission Denied</h3>
                <p className="text-white/40 text-sm max-w-xs">
                  {t.camPermReq}
                </p>
                <button 
                  onClick={handleRetry}
                  className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-black uppercase tracking-widest transition-colors"
                >
                  {t.retry}
                </button>
              </>
            )}
            {status === 'error' && (
              <>
                <AlertCircle className="w-16 h-16 text-rose-500 opacity-50" />
                <p className="text-rose-500 font-bold">{errorMsg}</p>
                <button 
                  onClick={handleRetry}
                  className="mt-4 px-6 py-2 bg-white/10 rounded-full text-xs font-black"
                >
                  {t.retry}
                </button>
              </>
            )}
          </div>
        )}
        
        {/* HUD Layer */}
        {status === 'ready' && (
          <>
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              {isRecording && (
                <div className="flex items-center gap-3 px-4 py-2 bg-[#121214]/80 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl">
                  <div className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse" />
                  <span className="text-sm font-mono tracking-widest text-white">{formatTime(elapsedTime)}</span>
                </div>
              )}
              <div className="px-4 py-1.5 bg-white/5 backdrop-blur-md rounded-full border border-white/10 text-[10px] uppercase font-black tracking-widest text-white/40">
                {checkpoints.length} Checkpoints
              </div>
            </div>

            <div className="absolute top-6 right-6 flex flex-col gap-2 items-end">
              {checkpoints.slice(-3).map((cp, idx) => (
                <div key={cp.id} className="text-[10px] font-mono bg-white/5 backdrop-blur-md px-3 py-1 rounded border border-white/10 text-white/60">
                  #{checkpoints.length - 2 + idx} <span className="mx-1 opacity-30">|</span> {formatTime(cp.time)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Record Controls */}
      <div className="h-32 sm:h-44 landscape:h-full landscape:w-32 landscape:sm:w-44 bg-[#121214] border-t landscape:border-t-0 landscape:border-l border-white/10 flex landscape:flex-col items-center justify-between px-4 sm:px-10 landscape:px-0 landscape:py-4 landscape:sm:py-10 relative shrink-0">
        <button 
          onClick={toggleCamera}
          className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white transition-colors shrink-0"
        >
          <RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <div className="relative flex-1 flex justify-center items-center">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={status !== 'ready'}
              className={cn(
                "w-16 h-16 sm:w-24 sm:h-24 rounded-full border-[4px] sm:border-[6px] transition-all flex items-center justify-center group",
                status === 'ready' ? "border-white/5 active:scale-95" : "border-white/5 opacity-20 cursor-not-allowed"
              )}
            >
              <div className="w-10 h-10 sm:w-16 sm:h-16 bg-red-600 rounded-full group-hover:scale-105 transition-transform shadow-[0_0_20px_rgba(220,38,38,0.3)] sm:shadow-[0_0_30px_rgba(220,38,38,0.3)]" />
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-[4px] sm:border-[6px] border-white/5 flex items-center justify-center group transition-all active:scale-95"
            >
              <div className="w-6 h-6 sm:w-12 sm:h-12 bg-white rounded-sm group-hover:scale-90 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)] sm:shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
            </button>
          )}
        </div>

        <button 
          onClick={addCheckpoint}
          disabled={!isRecording}
          className={cn(
            "w-12 h-12 sm:w-16 sm:h-16 flex flex-col items-center justify-center rounded-2xl sm:rounded-3xl border transition-all shadow-xl shrink-0",
            isRecording 
              ? "bg-orange-500 border-transparent text-black active:scale-90 shadow-orange-500/20" 
              : "bg-white/5 border-white/10 text-white/10 cursor-not-allowed"
          )}
        >
          <Pin className="w-5 h-5 sm:w-7 sm:h-7" />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tighter mt-0.5 sm:mt-1 hidden sm:block">Mark</span>
        </button>
      </div>
    </div>
  );
}
