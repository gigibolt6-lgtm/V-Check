import { useState, useRef, useEffect, useCallback } from "react";
import {
  Pin,
  RefreshCcw,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Images,
  X,
} from "lucide-react";
import { formatTime, cn } from "../lib/utils";
import { Checkpoint } from "../types";
import { useTranslation } from "../i18n";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";

interface CameraViewProps {
  onVideoReady: (
    url: string,
    duration: number,
    checkpoints: Checkpoint[],
  ) => void;
  stateNameHistory: string[];
}

type CameraStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "error"
  | "denied"
  | "unsupported";
type PermissionUiStatus =
  | "unknown"
  | "checking"
  | "prompt"
  | "granted"
  | "denied"
  | "error"
  | "web";

const CAMERA_PERMISSION_STORAGE_KEY = "vcheck.cameraPermissionGranted";

const hasStoredCameraPermissionGrant = () => {
  try {
    return localStorage.getItem(CAMERA_PERMISSION_STORAGE_KEY) === "true";
  } catch (err) {
    console.warn("[CameraView] Could not read camera permission flag", err);
    return false;
  }
};

const storeCameraPermissionGrant = () => {
  try {
    localStorage.setItem(CAMERA_PERMISSION_STORAGE_KEY, "true");
  } catch (err) {
    console.warn("[CameraView] Could not store camera permission flag", err);
  }
};

const clearStoredCameraPermissionGrant = () => {
  try {
    localStorage.removeItem(CAMERA_PERMISSION_STORAGE_KEY);
  } catch (err) {
    console.warn("[CameraView] Could not clear camera permission flag", err);
  }
};

type CameraErrorDetails = {
  name: string;
  message: string;
  platform: string;
  isNativePlatform: boolean;
  userAgent: string;
};

const getCameraErrorDetails = (error: unknown): CameraErrorDetails => {
  const err = error as { name?: string; message?: string };

  return {
    name: err.name || (error instanceof Error ? error.name : "UnknownError"),
    message:
      err.message || (error instanceof Error ? error.message : String(error)),
    platform: Capacitor.getPlatform(),
    isNativePlatform: Capacitor.isNativePlatform(),
    userAgent: navigator.userAgent,
  };
};

const formatCameraErrorDetails = (details: CameraErrorDetails) =>
  `name=${details.name}; message=${details.message}; platform=${details.platform}; isNativePlatform=${details.isNativePlatform}; userAgent=${details.userAgent}`;

const isPermissionDeniedError = (error: unknown) => {
  const err = error as { name?: string; message?: string };
  return (
    err.name === "NotAllowedError" ||
    err.name === "PermissionDeniedError" ||
    Boolean(err.message?.toLowerCase().includes("denied"))
  );
};

const normalizeFilesystemPermission = (
  permissionStatus: unknown,
): PermissionUiStatus => {
  const publicStorage = (permissionStatus as { publicStorage?: string })
    .publicStorage;

  if (publicStorage === "granted" || publicStorage === "limited")
    return "granted";
  if (publicStorage === "denied") return "denied";
  if (publicStorage === "prompt" || publicStorage === "prompt-with-rationale")
    return "prompt";

  return "unknown";
};

export default function CameraView({
  onVideoReady,
  stateNameHistory,
}: CameraViewProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const checkpointsRef = useRef<Checkpoint[]>([]);

  // Update ref whenever checkpoints state changes, to avoid stale closure issue in onstop
  useEffect(() => {
    checkpointsRef.current = checkpoints;
  }, [checkpoints]);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "environment",
  );
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [cameraPermissionStatus, setCameraPermissionStatus] =
    useState<PermissionUiStatus>(
      hasStoredCameraPermissionGrant() ? "granted" : "unknown",
    );
  const [showPermissionPanel, setShowPermissionPanel] = useState(
    () => !hasStoredCameraPermissionGrant(),
  );
  const [storagePermissionStatus, setStoragePermissionStatus] =
    useState<PermissionUiStatus>("unknown");
  const [permissionMessage, setPermissionMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraErrorDetails, setCameraErrorDetails] =
    useState<CameraErrorDetails | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const closePermissionPanelTimeoutRef = useRef<number | null>(null);
  const cameraInitializedRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  const schedulePermissionPanelClose = useCallback(() => {
    if (closePermissionPanelTimeoutRef.current) {
      window.clearTimeout(closePermissionPanelTimeoutRef.current);
    }

    closePermissionPanelTimeoutRef.current = window.setTimeout(() => {
      setShowPermissionPanel(false);
      closePermissionPanelTimeoutRef.current = null;
    }, 1000);
  }, []);

  const stopActiveStream = useCallback(() => {
    activeStreamRef.current?.getTracks().forEach((track) => track.stop());
    activeStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const attachCameraStream = useCallback(
    (stream: MediaStream) => {
      stopActiveStream();
      activeStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    },
    [stopActiveStream],
  );

  const updateCameraError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      const details = getCameraErrorDetails(error);
      const detailText = formatCameraErrorDetails(details);

      setCameraErrorDetails(details);
      setErrorMsg(`${fallbackMessage}\n${detailText}`);
      console.error("[CameraView] getUserMedia failed", details, error);

      return details;
    },
    [],
  );

  const markCameraAccessGranted = useCallback(() => {
    storeCameraPermissionGrant();
    setStatus("ready");
    setCameraPermissionStatus("granted");
    setPermissionMessage(t.permissionCameraGranted);
    schedulePermissionPanelClose();
  }, [schedulePermissionPanelClose, t.permissionCameraGranted]);

  const handleCameraAccessFailure = useCallback(() => {
    clearStoredCameraPermissionGrant();
    setShowPermissionPanel(true);
  }, []);

  const requestCameraAccess = useCallback(
    async (requestedFacingMode = facingMode) => {
      setStatus("initializing");
      setCameraPermissionStatus("checking");
      setPermissionMessage("");
      setErrorMsg("");
      setCameraErrorDetails(null);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          const unsupportedError = new Error(t.camUnsupportedWebView);
          unsupportedError.name = "NotSupportedError";
          throw unsupportedError;
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: requestedFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        attachCameraStream(stream);
        markCameraAccessGranted();
      } catch (err: unknown) {
        const details = getCameraErrorDetails(err);
        console.error("[CameraView] getUserMedia error", details, err);

        if (details.name === "OverconstrainedError") {
          try {
            const simpleStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            attachCameraStream(simpleStream);
            markCameraAccessGranted();
            return;
          } catch (retryErr: unknown) {
            const retryDetails = updateCameraError(
              retryErr,
              isPermissionDeniedError(retryErr) ? t.camDenied : t.camNotFound,
            );
            const denied = isPermissionDeniedError(retryErr);
            handleCameraAccessFailure();
            setStatus(denied ? "denied" : "error");
            setCameraPermissionStatus(denied ? "denied" : "error");
            setPermissionMessage(
              denied ? t.permissionCameraDenied : t.permissionCameraError,
            );

            if (
              Capacitor.isNativePlatform() &&
              retryDetails.name === "NotSupportedError"
            ) {
              setStatus("unsupported");
              setPermissionMessage(t.camUnsupportedWebView);
            }
            return;
          }
        }

        if (isPermissionDeniedError(err)) {
          updateCameraError(err, t.camDenied);
          handleCameraAccessFailure();
          setStatus("denied");
          setCameraPermissionStatus("denied");
          setPermissionMessage(t.permissionCameraDenied);
          return;
        }

        const unsupported =
          details.name === "NotSupportedError" ||
          details.message === t.camUnsupportedWebView;
        updateCameraError(
          err,
          unsupported && Capacitor.isNativePlatform()
            ? t.camUnsupportedWebView
            : details.message || t.camError,
        );
        handleCameraAccessFailure();
        setStatus(unsupported ? "unsupported" : "error");
        setCameraPermissionStatus("error");
        setPermissionMessage(
          unsupported ? t.camUnsupportedWebView : t.permissionCameraError,
        );
      }
    },
    [
      attachCameraStream,
      facingMode,
      handleCameraAccessFailure,
      markCameraAccessGranted,
      t,
      updateCameraError,
    ],
  );

  const checkStoragePermission = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setStoragePermissionStatus("web");
      return;
    }

    setStoragePermissionStatus("checking");
    try {
      const permissionStatus = await Filesystem.checkPermissions();
      setStoragePermissionStatus(
        normalizeFilesystemPermission(permissionStatus),
      );
    } catch (err) {
      console.error("Storage permission check error:", err);
      setStoragePermissionStatus("error");
    }
  }, []);

  const requestStoragePermission = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setStoragePermissionStatus("web");
      setPermissionMessage(t.permissionStorageWeb);
      return;
    }

    setStoragePermissionStatus("checking");
    setPermissionMessage("");

    try {
      const permissionStatus = await Filesystem.requestPermissions();
      const normalized = normalizeFilesystemPermission(permissionStatus);
      setStoragePermissionStatus(normalized);
      setPermissionMessage(
        normalized === "granted"
          ? t.permissionStorageGranted
          : t.permissionStorageDenied,
      );
    } catch (err) {
      console.error("Storage permission request error:", err);
      setStoragePermissionStatus("error");
      setPermissionMessage(t.permissionStorageError);
    }
  }, [t]);

  useEffect(() => {
    checkStoragePermission();

    if (cameraInitializedRef.current) return;
    cameraInitializedRef.current = true;

    if (hasStoredCameraPermissionGrant()) {
      setShowPermissionPanel(false);
      setCameraPermissionStatus("granted");
      requestCameraAccess();
      return;
    }

    setShowPermissionPanel(true);
    setCameraPermissionStatus(activeStreamRef.current ? "granted" : "unknown");
  }, [checkStoragePermission, requestCameraAccess]);

  useEffect(() => {
    return () => {
      stopActiveStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (closePermissionPanelTimeoutRef.current) {
        window.clearTimeout(closePermissionPanelTimeoutRef.current);
      }
    };
  }, [stopActiveStream]);

  const handleRetry = () => requestCameraAccess();

  const handleShowPermissionPanel = () => {
    if (closePermissionPanelTimeoutRef.current) {
      window.clearTimeout(closePermissionPanelTimeoutRef.current);
      closePermissionPanelTimeoutRef.current = null;
    }

    setShowPermissionPanel(true);
  };

  const getSupportedMimeType = () => {
    const types = [
      "video/mp4;codecs=h264",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  const startRecording = () => {
    if (!videoRef.current?.srcObject || status !== "ready") return;

    chunksRef.current = [];
    const stream = videoRef.current.srcObject as MediaStream;
    const mimeType = getSupportedMimeType();

    try {
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "video/mp4",
        });
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
      stateName: t.newState,
    };
    setCheckpoints((prev) => [...prev, newCheckpoint]);
  };

  const toggleCamera = () => {
    const nextFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacingMode);

    if (status === "ready") {
      requestCameraAccess(nextFacingMode);
    }
  };

  const getPermissionLabel = (permissionStatus: PermissionUiStatus) => {
    switch (permissionStatus) {
      case "checking":
        return t.permissionChecking;
      case "prompt":
      case "unknown":
        return t.permissionNotGranted;
      case "granted":
        return t.permissionGranted;
      case "denied":
        return t.permissionDenied;
      case "web":
        return t.permissionStorageWeb;
      case "error":
      default:
        return t.permissionError;
    }
  };

  const getPermissionTone = (permissionStatus: PermissionUiStatus) => {
    switch (permissionStatus) {
      case "granted":
      case "web":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
      case "denied":
      case "error":
        return "border-rose-500/30 bg-rose-500/10 text-rose-300";
      case "checking":
        return "border-orange-500/30 bg-orange-500/10 text-orange-300";
      default:
        return "border-white/10 bg-white/5 text-white/50";
    }
  };

  const permissionCards = [
    {
      label: t.permissionCameraLabel,
      status: cameraPermissionStatus,
      buttonLabel:
        status === "ready"
          ? t.permissionCameraRefresh
          : t.permissionCameraButton,
      onClick: () => requestCameraAccess(),
      icon: ShieldCheck,
      disabled:
        cameraPermissionStatus === "checking" || status === "initializing",
    },
    {
      label: t.permissionStorageLabel,
      status: storagePermissionStatus,
      buttonLabel: Capacitor.isNativePlatform()
        ? t.permissionStorageButton
        : t.permissionStorageWebButton,
      onClick: requestStoragePermission,
      icon: Images,
      disabled:
        storagePermissionStatus === "checking" ||
        storagePermissionStatus === "web",
    },
  ];

  return (
    <div className="relative h-full bg-[#0A0A0B] overflow-hidden flex flex-col landscape:flex-row">
      {/* Camera Preview Area */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {!isRecording && (
          <button
            type="button"
            onClick={handleShowPermissionPanel}
            className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-[#121214]/70 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/60 shadow-xl backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
          >
            {t.permissionPanelTitle}
          </button>
        )}

        {!isRecording && showPermissionPanel && (
          <div className="absolute top-16 left-4 right-4 z-30 flex justify-center pointer-events-none">
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#121214]/80 p-3 shadow-2xl backdrop-blur-xl pointer-events-auto sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-500/80">
                    {t.permissionPanelTitle}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    {t.permissionPanelDesc}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CheckCircle2
                    className={cn(
                      "h-5 w-5",
                      cameraPermissionStatus === "granted"
                        ? "text-emerald-400"
                        : "text-white/15",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPermissionPanel(false)}
                    className="rounded-full border border-white/10 bg-white/5 p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Close permission panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {permissionCards.map(
                  ({
                    label,
                    status: permissionStatus,
                    buttonLabel,
                    onClick,
                    icon: Icon,
                    disabled,
                  }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/5 bg-black/25 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-orange-500" />
                          <span className="truncate text-[10px] font-black uppercase tracking-widest text-white/70">
                            {label}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                            getPermissionTone(permissionStatus),
                          )}
                        >
                          {getPermissionLabel(permissionStatus)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={onClick}
                        disabled={disabled}
                        className="w-full rounded-xl bg-orange-500 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black transition-colors hover:bg-orange-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/25"
                      >
                        {buttonLabel}
                      </button>
                    </div>
                  ),
                )}
              </div>

              {permissionMessage && (
                <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60">
                  {permissionMessage}
                </p>
              )}

              {cameraErrorDetails && (
                <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl bg-rose-500/10 px-3 py-2 text-left text-[10px] leading-relaxed text-rose-200">
                  {formatCameraErrorDetails(cameraErrorDetails)}
                </pre>
              )}
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            "w-full h-full object-cover",
            status !== "ready" && "hidden",
          )}
        />

        {status !== "ready" && (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            {status === "idle" && (
              <>
                <ShieldCheck className="w-16 h-16 text-orange-500 opacity-60" />
                <h3 className="text-lg font-bold uppercase tracking-tight">
                  {t.permissionPanelTitle}
                </h3>
                <p className="text-white/40 text-sm max-w-xs">
                  {t.permissionPanelDesc}
                </p>
              </>
            )}
            {status === "initializing" && (
              <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            )}
            {status === "denied" && (
              <>
                <AlertCircle className="w-16 h-16 text-rose-500 opacity-50" />
                <h3 className="text-lg font-bold uppercase tracking-tight">
                  Camera Permission Denied
                </h3>
                <p className="text-white/40 text-sm max-w-xs">{t.camPermReq}</p>
                <button
                  onClick={handleRetry}
                  className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-black uppercase tracking-widest transition-colors"
                >
                  {t.retry}
                </button>
              </>
            )}
            {status === "unsupported" && (
              <>
                <AlertCircle className="w-16 h-16 text-rose-500 opacity-50" />
                <p className="text-rose-500 font-bold">
                  {t.camUnsupportedWebView}
                </p>
                <button
                  onClick={handleRetry}
                  className="mt-4 px-6 py-2 bg-white/10 rounded-full text-xs font-black"
                >
                  {t.retry}
                </button>
              </>
            )}
            {status === "error" && (
              <>
                <AlertCircle className="w-16 h-16 text-rose-500 opacity-50" />
                <p className="whitespace-pre-wrap text-rose-500 font-bold">
                  {errorMsg}
                </p>
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
        {status === "ready" && (
          <>
            <div className="absolute top-6 left-6 flex flex-col gap-2">
              {isRecording && (
                <div className="flex items-center gap-3 px-4 py-2 bg-[#121214]/80 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl">
                  <div className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse" />
                  <span className="text-sm font-mono tracking-widest text-white">
                    {formatTime(elapsedTime)}
                  </span>
                </div>
              )}
              <div className="px-4 py-1.5 bg-white/5 backdrop-blur-md rounded-full border border-white/10 text-[10px] uppercase font-black tracking-widest text-white/40">
                {checkpoints.length} Checkpoints
              </div>
            </div>

            <div className="absolute top-6 right-6 flex flex-col gap-2 items-end">
              {checkpoints.slice(-3).map((cp, idx) => (
                <div
                  key={cp.id}
                  className="text-[10px] font-mono bg-white/5 backdrop-blur-md px-3 py-1 rounded border border-white/10 text-white/60"
                >
                  #{checkpoints.length - 2 + idx}{" "}
                  <span className="mx-1 opacity-30">|</span>{" "}
                  {formatTime(cp.time)}
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
              disabled={status !== "ready"}
              className={cn(
                "w-16 h-16 sm:w-24 sm:h-24 rounded-full border-[4px] sm:border-[6px] transition-all flex items-center justify-center group",
                status === "ready"
                  ? "border-white/5 active:scale-95"
                  : "border-white/5 opacity-20 cursor-not-allowed",
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
              : "bg-white/5 border-white/10 text-white/10 cursor-not-allowed",
          )}
        >
          <Pin className="w-5 h-5 sm:w-7 sm:h-7" />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tighter mt-0.5 sm:mt-1 hidden sm:block">
            Mark
          </span>
        </button>
      </div>
    </div>
  );
}
