import { Directory, Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Media } from '@capacitor-community/media';
import { useState, RefObject } from 'react';
import { VideoData } from '../types';

const CAPACITOR_SAVE_DIRECTORIES = [
  Directory.Documents,
  Directory.Data,
  Directory.Cache,
  Directory.ExternalStorage,
];

const GALLERY_ALBUM_NAME = 'V-Check';

const MP4_MIME_CANDIDATES = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=h264,aac', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
] as const;

const WEBM_MIME_CANDIDATES = [
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=h264', extension: 'webm' },
] as const;

const ANDROID_RECORDER_MIME_CANDIDATES = [
  { mimeType: 'video/webm', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: '', extension: 'webm' },
] as const;

const getVideoMimeCandidates = () => (
  Capacitor.getPlatform() === 'android'
    ? ANDROID_RECORDER_MIME_CANDIDATES
    : [...MP4_MIME_CANDIDATES, ...WEBM_MIME_CANDIDATES]
);

type ExportMimeInfo = {
  mimeType: string;
  extension: 'mp4' | 'webm';
};

type TestedMimeTypeResult = {
  requestedMimeType: string;
  actualMimeType: string;
  isTypeSupported: boolean | 'unknown';
  success: boolean;
  chunkCount: number;
  dataAvailableCallCount: number;
  blobSize: number;
  firstDataAvailableTimeMs?: number;
  error?: string;
};

type CanvasRecorderSupportResult = {
  isCanvasRecorderSupportedOnThisDevice: boolean;
  selectedMimeInfo?: ExportMimeInfo;
  selectedMimeType: string;
  testedMimeTypes: string[];
  testedMimeTypeResults: TestedMimeTypeResult[];
  testRecorderChunkCount: number;
  testRecorderBlobSize: number;
};

type SaveAttempt = {
  method: string;
  directory?: Directory;
  success: boolean;
  uri?: string;
  error?: string;
};

const formatExportTimestamp = () => {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');

  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const logExportInfo = (message: string, details?: Record<string, unknown>) => {
  if (details) {
    console.info(`[VideoExport] ${message}`, details);
  } else {
    console.info(`[VideoExport] ${message}`);
  }
};

const logExportError = (message: string, error: unknown, details?: Record<string, unknown>) => {
  console.error(`[VideoExport] ${message}`, {
    ...details,
    errorMessage: getErrorMessage(error),
    error,
  });
};

const getExtensionForMimeType = (mimeType: string): 'mp4' | 'webm' => (
  mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'webm'
);

const getSupportedMimeTypes = () => {
  const candidates = getVideoMimeCandidates();
  if (typeof MediaRecorder === 'undefined') return [];
  if (typeof MediaRecorder.isTypeSupported !== 'function') return candidates;

  return candidates.filter(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
};

const createMediaRecorder = (stream: MediaStream) => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('この環境では MediaRecorder が利用できないため、動画を書き出せません。');
  }

  const supportedMimeTypes = getSupportedMimeTypes();
  const candidates = supportedMimeTypes.length > 0 ? supportedMimeTypes : [{ mimeType: '', extension: 'webm' as const }];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const recorder = candidate.mimeType
        ? new MediaRecorder(stream, { mimeType: candidate.mimeType })
        : new MediaRecorder(stream);
      const actualMimeType = recorder.mimeType || candidate.mimeType || 'video/webm';

      logExportInfo('MediaRecorder selected', {
        requestedMimeType: candidate.mimeType || '(browser default)',
        actualMimeType,
        extension: getExtensionForMimeType(actualMimeType),
        supportedMimeTypes: supportedMimeTypes.map(({ mimeType }) => mimeType),
        platform: Capacitor.getPlatform(),
        isNative: Capacitor.isNativePlatform(),
      });

      return {
        recorder,
        mimeInfo: {
          mimeType: actualMimeType,
          extension: getExtensionForMimeType(actualMimeType),
        } satisfies ExportMimeInfo,
      };
    } catch (error) {
      lastError = error;
      logExportError('MediaRecorder candidate failed', error, { requestedMimeType: candidate.mimeType });
    }
  }

  throw lastError || new Error('この端末で利用できる動画 MIME type が見つかりませんでした。');
};



const createMediaRecorderWithMimeInfo = (stream: MediaStream, mimeInfo: ExportMimeInfo) => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('この環境では MediaRecorder が利用できないため、動画を書き出せません。');
  }

  return mimeInfo.mimeType
    ? new MediaRecorder(stream, { mimeType: mimeInfo.mimeType })
    : new MediaRecorder(stream);
};

const requestRecorderData = (recorder: MediaRecorder, reason: string, details?: Record<string, unknown>) => {
  if (recorder.state !== 'recording') return;

  try {
    recorder.requestData();
    logExportInfo('MediaRecorder.requestData called', {
      reason,
      mediaRecorderState: recorder.state,
      recorderMimeType: recorder.mimeType,
      ...details,
    });
  } catch (error) {
    logExportError('MediaRecorder.requestData failed', error, {
      reason,
      mediaRecorderState: recorder.state,
      recorderMimeType: recorder.mimeType,
      ...details,
    });
  }
};

const runCanvasRecorderSmokeTest = async (): Promise<CanvasRecorderSupportResult> => {
  const candidates = getVideoMimeCandidates();
  const testedMimeTypes = candidates.map(candidate => candidate.mimeType || '(browser default)');
  const testedMimeTypeResults: TestedMimeTypeResult[] = [];

  if (typeof MediaRecorder === 'undefined') {
    return {
      isCanvasRecorderSupportedOnThisDevice: false,
      selectedMimeType: '',
      testedMimeTypes,
      testedMimeTypeResults: candidates.map(candidate => ({
        requestedMimeType: candidate.mimeType || '(browser default)',
        actualMimeType: '',
        isTypeSupported: 'unknown',
        success: false,
        chunkCount: 0,
        dataAvailableCallCount: 0,
        blobSize: 0,
        error: 'MediaRecorder is undefined',
      })),
      testRecorderChunkCount: 0,
      testRecorderBlobSize: 0,
    };
  }

  for (const candidate of candidates) {
    const isTypeSupported = candidate.mimeType && typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported(candidate.mimeType)
      : 'unknown';
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    if (!ctx || typeof canvas.captureStream !== 'function') {
      testedMimeTypeResults.push({
        requestedMimeType: candidate.mimeType || '(browser default)',
        actualMimeType: '',
        isTypeSupported,
        success: false,
        chunkCount: 0,
        dataAvailableCallCount: 0,
        blobSize: 0,
        error: !ctx ? '2D canvas context unavailable' : 'canvas.captureStream unavailable',
      });
      continue;
    }

    let animationFrameId = 0;
    const drawTestFrame = (frame = 0) => {
      ctx.fillStyle = frame % 2 === 0 ? '#ff0000' : '#00ff00';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`V-Check ${frame}`, 24, 96);
      animationFrameId = requestAnimationFrame(() => drawTestFrame(frame + 1));
    };

    let stream: MediaStream | undefined;
    try {
      drawTestFrame();
      stream = canvas.captureStream(10);
      const recorder = candidate.mimeType
        ? new MediaRecorder(stream, { mimeType: candidate.mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      let dataAvailableCallCount = 0;
      let firstDataAvailableTimeMs: number | undefined;
      const testStartTime = performance.now();

      const result = await new Promise<TestedMimeTypeResult>((resolve) => {
        let settled = false;
        const finish = (success: boolean, error?: string) => {
          if (settled) return;
          settled = true;
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          stream?.getTracks().forEach(track => track.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || candidate.mimeType || 'video/webm' });
          resolve({
            requestedMimeType: candidate.mimeType || '(browser default)',
            actualMimeType: recorder.mimeType || candidate.mimeType || 'video/webm',
            isTypeSupported,
            success,
            chunkCount: chunks.length,
            dataAvailableCallCount,
            blobSize: blob.size,
            firstDataAvailableTimeMs,
            error,
          });
        };

        recorder.ondataavailable = (event) => {
          dataAvailableCallCount += 1;
          firstDataAvailableTimeMs ??= performance.now() - testStartTime;
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = (event) => finish(false, getErrorMessage(event));
        recorder.onstop = () => finish(chunks.length > 0, chunks.length > 0 ? undefined : 'MediaRecorder produced no chunks');

        try {
          recorder.start(250);
          requestRecorderData(recorder, 'android smoke test start');
          window.setTimeout(() => requestRecorderData(recorder, 'android smoke test 1s'), 1000);
          window.setTimeout(() => {
            requestRecorderData(recorder, 'android smoke test before stop');
            if (recorder.state !== 'inactive') recorder.stop();
          }, 1200);
          window.setTimeout(() => finish(false, 'MediaRecorder smoke test timed out'), 4000);
        } catch (error) {
          finish(false, getErrorMessage(error));
        }
      });

      testedMimeTypeResults.push(result);
      logExportInfo('Android canvas MediaRecorder smoke test result', result);

      if (result.success) {
        return {
          isCanvasRecorderSupportedOnThisDevice: true,
          selectedMimeInfo: {
            mimeType: result.requestedMimeType === '(browser default)' ? '' : result.actualMimeType,
            extension: getExtensionForMimeType(result.actualMimeType),
          },
          selectedMimeType: result.requestedMimeType === '(browser default)' ? '(browser default)' : result.actualMimeType,
          testedMimeTypes,
          testedMimeTypeResults,
          testRecorderChunkCount: result.chunkCount,
          testRecorderBlobSize: result.blobSize,
        };
      }
    } catch (error) {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      stream?.getTracks().forEach(track => track.stop());
      const result = {
        requestedMimeType: candidate.mimeType || '(browser default)',
        actualMimeType: candidate.mimeType,
        isTypeSupported,
        success: false,
        chunkCount: 0,
        dataAvailableCallCount: 0,
        blobSize: 0,
        error: getErrorMessage(error),
      } satisfies TestedMimeTypeResult;
      testedMimeTypeResults.push(result);
      logExportInfo('Android canvas MediaRecorder smoke test result', result);
    }
  }

  return {
    isCanvasRecorderSupportedOnThisDevice: false,
    selectedMimeType: '',
    testedMimeTypes,
    testedMimeTypeResults,
    testRecorderChunkCount: 0,
    testRecorderBlobSize: 0,
  };
};

const getCanvasRecorderUnsupportedMessage = () => (
  'この端末のAndroid WebViewでは動画合成出力に対応していない可能性があります。黒い0秒動画は保存しません。CSV出力、元動画保存、プロジェクトZIP保存、オーバーレイ設定JSON保存を利用してください。'
);

const waitForAnimationFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const waitForVideoFrame = (video: HTMLVideoElement, timeoutMs = 1000) => new Promise<void>((resolve) => {
  const requestVideoFrameCallback = (video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
  }).requestVideoFrameCallback;
  let settled = false;
  const timeoutId = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    resolve();
  }, timeoutMs);
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    resolve();
  };

  if (requestVideoFrameCallback) {
    requestVideoFrameCallback.call(video, finish);
    return;
  }

  requestAnimationFrame(finish);
});

const waitForVideoReady = (video: HTMLVideoElement, timeoutMs = 10000) => new Promise<void>((resolve, reject) => {
  const hasUsableMetadata = () => (
    video.readyState >= HTMLMediaElement.HAVE_METADATA
    && video.videoWidth > 0
    && video.videoHeight > 0
    && Number.isFinite(video.duration)
    && video.duration > 0
  );

  if (hasUsableMetadata()) {
    resolve();
    return;
  }

  let timeoutId: number | undefined;
  const cleanup = () => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    video.removeEventListener('loadedmetadata', onReady);
    video.removeEventListener('loadeddata', onReady);
    video.removeEventListener('canplay', onReady);
    video.removeEventListener('error', onError);
  };
  const onReady = () => {
    if (!hasUsableMetadata()) return;
    cleanup();
    resolve();
  };
  const onError = () => {
    cleanup();
    reject(new Error('動画メタデータを読み込めませんでした。'));
  };

  timeoutId = window.setTimeout(() => {
    cleanup();
    reject(new Error(`動画メタデータの読み込みがタイムアウトしました。readyState=${video.readyState}, video=${video.videoWidth}x${video.videoHeight}, duration=${video.duration}`));
  }, timeoutMs);

  video.addEventListener('loadedmetadata', onReady);
  video.addEventListener('loadeddata', onReady);
  video.addEventListener('canplay', onReady);
  video.addEventListener('error', onError);
  video.load();
});

const waitForSeek = async (video: HTMLVideoElement, timeSec: number, timeoutMs = 10000) => {
  await waitForVideoReady(video);
  const targetTime = Math.max(0, Math.min(timeSec, Number.isFinite(video.duration) ? video.duration : timeSec));

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;
    const cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onSeeked = () => finish();
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('動画のシークに失敗しました。'));
    };

    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`動画のシークがタイムアウトしました。target=${targetTime}, currentTime=${video.currentTime}, readyState=${video.readyState}`));
    }, timeoutMs);

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    if (Math.abs(video.currentTime - targetTime) < 0.01 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      finish();
      return;
    }

    video.currentTime = targetTime;
  });

  await waitForVideoFrame(video);
  await waitForAnimationFrame();
};

const assertExportFrameDimensions = (canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error(`canvasサイズが不正です。canvas=${canvas.width}x${canvas.height}`);
  }

  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error(`動画サイズを取得できません。video=${video.videoWidth}x${video.videoHeight}, readyState=${video.readyState}`);
  }
};

const formatExportDiagnostics = (details: Record<string, unknown>) => Object.entries(details)
  .map(([key, value]) => `${key}=${String(value)}`)
  .join(', ');

const MIN_VALID_EXPORT_BLOB_BYTES = 1024;
const MIN_VALID_RECORDED_DURATION_MS = 1000;
const NON_BLACK_SAMPLE_INTERVAL_FRAMES = 5;
const NON_BLACK_RGB_THRESHOLD = 24;

const getTrackReadyStates = (stream: MediaStream) => stream.getVideoTracks().map(track => track.readyState);


const isAndroidWebMExport = (mimeInfo: ExportMimeInfo) => (
  Capacitor.getPlatform() === 'android' && mimeInfo.extension === 'webm'
);

const getWebMPlaybackNotice = (mimeInfo: ExportMimeInfo) => (
  isAndroidWebMExport(mimeInfo)
    ? '\nWebM形式で保存しました。端末標準プレイヤーで再生できない場合は、VLC等のWebM対応プレイヤーで確認してください。'
    : ''
);

const CANVAS_SAMPLE_POINTS = [
  ...[0.1, 0.25, 0.5, 0.75, 0.9].flatMap(x => [0.1, 0.25, 0.5, 0.75, 0.9].map(y => [x, y])),
];

const getCanvasSamplePixels = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max - 1, Math.round(value)));

  return CANVAS_SAMPLE_POINTS.map(([xRatio, yRatio]) => {
    const { data } = ctx.getImageData(clamp(width * xRatio, width), clamp(height * yRatio, height), 1, 1);
    return data;
  });
};

const isSampleNonBlack = (ctx: CanvasRenderingContext2D, width: number, height: number) => (
  getCanvasSamplePixels(ctx, width, height).some(data => (
    data[0] > NON_BLACK_RGB_THRESHOLD
    || data[1] > NON_BLACK_RGB_THRESHOLD
    || data[2] > NON_BLACK_RGB_THRESHOLD
  ))
);

const isSampleVisible = (ctx: CanvasRenderingContext2D, width: number, height: number) => (
  getCanvasSamplePixels(ctx, width, height).some(data => data[3] > 0)
);

type BlobPlaybackProbeResult = {
  metadataLoaded: boolean;
  canPlay: boolean;
  errorMessage?: string;
  durationMs?: number | 'unknown';
  videoWidth?: number;
  videoHeight?: number;
};

const probeBlobPlayback = (blob: Blob, timeoutMs = 5000) => new Promise<BlobPlaybackProbeResult>((resolve) => {
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  let timeoutId: number | undefined;
  let settled = false;
  let metadataLoaded = false;

  const cleanup = () => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    video.onloadedmetadata = null;
    video.oncanplay = null;
    video.onplaying = null;
    video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };

  const finish = (result: BlobPlaybackProbeResult) => {
    if (settled) return;
    settled = true;
    const durationMs = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration * 1000
      : 'unknown';
    cleanup();
    resolve({
      durationMs,
      videoWidth: video.videoWidth || undefined,
      videoHeight: video.videoHeight || undefined,
      ...result,
    });
  };

  timeoutId = window.setTimeout(() => {
    finish({
      metadataLoaded,
      canPlay: false,
      errorMessage: `Blobプレビュー確認がタイムアウトしました。readyState=${video.readyState}`,
    });
  }, timeoutMs);

  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.onloadedmetadata = () => {
    metadataLoaded = true;
  };
  video.oncanplay = () => finish({ metadataLoaded: true, canPlay: true });
  video.onplaying = () => finish({ metadataLoaded: true, canPlay: true });
  video.onerror = () => finish({
    metadataLoaded,
    canPlay: false,
    errorMessage: video.error ? `code=${video.error.code}, message=${video.error.message}` : 'unknown video error',
  });
  video.src = url;
  video.load();

  const playPromise = video.play();
  if (playPromise) {
    playPromise.catch((error) => {
      logExportError('Blob preview play() failed; continuing because this may be a WebM compatibility/autoplay limitation', error, {
        blobType: blob.type,
        blobSize: blob.size,
        platform: Capacitor.getPlatform(),
      });
    });
  }
});


const getBlobVideoDurationMs = (blob: Blob, timeoutMs = 5000) => new Promise<number | null>((resolve) => {
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  let timeoutId: number | undefined;

  const cleanup = () => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };

  const finish = (durationMs: number | null) => {
    cleanup();
    resolve(durationMs);
  };

  timeoutId = window.setTimeout(() => finish(null), timeoutMs);
  video.preload = 'metadata';
  video.onloadedmetadata = () => {
    const durationMs = video.duration * 1000;
    finish(Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null);
  };
  video.onerror = () => finish(null);
  video.src = url;
  video.load();
});

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

const downloadBlobInBrowser = (blob: Blob, fileName: string, messagePrefix = '動画のダウンロードを開始しました') => {
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
  alert(`${messagePrefix}: ${fileName}${getWebMPlaybackNotice({ mimeType: blob.type, extension: getExtensionForMimeType(blob.type) })}`);

  return url;
};

const ensureGalleryAlbumIdentifier = async () => {
  const platform = Capacitor.getPlatform();

  const findAlbum = async () => {
    const { albums } = await Media.getAlbums();

    if (platform !== 'android') {
      return albums.find(album => album.name === GALLERY_ALBUM_NAME)?.identifier;
    }

    try {
      const albumsPath = (await Media.getAlbumsPath()).path;
      return albums.find(album => album.name === GALLERY_ALBUM_NAME && album.identifier.startsWith(albumsPath))?.identifier
        || albums.find(album => album.name === GALLERY_ALBUM_NAME)?.identifier;
    } catch (error) {
      logExportError('Media.getAlbumsPath failed; falling back to album name lookup', error);
      return albums.find(album => album.name === GALLERY_ALBUM_NAME)?.identifier;
    }
  };

  let albumIdentifier = await findAlbum();
  if (!albumIdentifier) {
    await Media.createAlbum({ name: GALLERY_ALBUM_NAME });
    albumIdentifier = await findAlbum();
  }

  if (platform === 'android' && !albumIdentifier) {
    throw new Error('Android のギャラリー保存に必要なアルバム ID を取得できませんでした。');
  }

  return albumIdentifier;
};

const saveToGallery = async (base64Data: string, fileNameBase: string, mimeInfo: ExportMimeInfo) => {
  const albumIdentifier = await ensureGalleryAlbumIdentifier();
  const dataUri = `data:${mimeInfo.mimeType};base64,${base64Data}`;

  logExportInfo('Attempting gallery save via @capacitor-community/media', {
    albumName: GALLERY_ALBUM_NAME,
    albumIdentifier,
    mimeType: mimeInfo.mimeType,
    fileNameBase,
  });

  const result = await Media.saveVideo({
    path: dataUri,
    albumIdentifier,
    fileName: fileNameBase,
  });

  logExportInfo('Gallery save succeeded', { result });
  return result.filePath || result.identifier || `${GALLERY_ALBUM_NAME}/${fileNameBase}.${mimeInfo.extension}`;
};

const saveToCapacitorFilesystem = async (base64Data: string, fileName: string, mimeInfo: ExportMimeInfo, attempts: SaveAttempt[]) => {
  let lastError: unknown;

  for (const directory of CAPACITOR_SAVE_DIRECTORIES) {
    try {
      logExportInfo('Attempting Filesystem.writeFile', {
        selectedDirectory: directory,
        fileName,
        mimeType: mimeInfo.mimeType,
        base64Length: base64Data.length,
      });

      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory,
        recursive: true,
      });

      attempts.push({ method: 'Filesystem.writeFile', directory, success: true, uri: result.uri });
      logExportInfo('Filesystem.writeFile succeeded', { selectedDirectory: directory, uri: result.uri });
      return { uri: result.uri, directory };
    } catch (error) {
      lastError = error;
      attempts.push({ method: 'Filesystem.writeFile', directory, success: false, error: getErrorMessage(error) });
      logExportError('Filesystem.writeFile failed', error, {
        selectedDirectory: directory,
        fileName,
        mimeType: mimeInfo.mimeType,
      });
    }
  }

  throw lastError || new Error('Filesystem.writeFile がすべての保存先で失敗しました。');
};

const saveVideoBlob = async (blob: Blob, mimeInfo: ExportMimeInfo) => {
  const fileNameBase = `exported-video-${formatExportTimestamp()}`;
  const fileName = `${fileNameBase}.${mimeInfo.extension}`;
  const isNative = Capacitor.isNativePlatform();
  const attempts: SaveAttempt[] = [];

  logExportInfo('Saving exported video', {
    fileName,
    mimeType: mimeInfo.mimeType,
    blobType: blob.type,
    blobSize: blob.size,
    isNative,
    platform: Capacitor.getPlatform(),
  });

  if (!blob.size) {
    throw new Error('書き出された動画データが空です。MediaRecorder または canvas.captureStream がこの端末で正常に動作していない可能性があります。');
  }

  if (!isNative) {
    return downloadBlobInBrowser(blob, fileName);
  }

  let base64Data = '';
  try {
    base64Data = await blobToBase64(blob);
    logExportInfo('Blob converted to base64', {
      fileName,
      blobSize: blob.size,
      base64Length: base64Data.length,
      mimeType: mimeInfo.mimeType,
    });
  } catch (error) {
    logExportError('Blob to base64 conversion failed', error, { fileName, blobSize: blob.size, mimeType: mimeInfo.mimeType });
    throw new Error(`動画データの変換に失敗しました。動画が大きすぎる可能性があります。詳細: ${getErrorMessage(error)}`);
  }

  try {
    const galleryUri = await saveToGallery(base64Data, fileNameBase, mimeInfo);
    attempts.push({ method: '@capacitor-community/media.saveVideo', success: true, uri: galleryUri });
    alert(`動画をアルバム「${GALLERY_ALBUM_NAME}」に保存しました: ${fileName}${getWebMPlaybackNotice(mimeInfo)}`);
    return galleryUri;
  } catch (error) {
    attempts.push({ method: '@capacitor-community/media.saveVideo', success: false, error: getErrorMessage(error) });
    logExportError('Gallery save failed; falling back to Filesystem.writeFile', error, {
      fileName,
      mimeType: mimeInfo.mimeType,
      blobSize: blob.size,
    });
  }

  try {
    const { uri, directory } = await saveToCapacitorFilesystem(base64Data, fileName, mimeInfo, attempts);
    alert(`アルバム保存に失敗したため、${directory} に保存しました: ${fileName}\nURI: ${uri}${getWebMPlaybackNotice(mimeInfo)}`);
    return uri;
  } catch (filesystemError) {
    logExportError('All native save methods failed; attempting browser download fallback', filesystemError, {
      fileName,
      mimeType: mimeInfo.mimeType,
      blobSize: blob.size,
      attempts,
    });

    downloadBlobInBrowser(blob, fileName, 'ネイティブ保存に失敗したため、ブラウザダウンロードを試行しました');
    throw new Error(`動画の保存に失敗しました。mimeType=${mimeInfo.mimeType}, size=${blob.size} bytes, attempts=${JSON.stringify(attempts)}`);
  }
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

    try {
      await waitForVideoReady(video);
      logExportInfo('Source video ready for export', {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        exportMode,
      });
    } catch (error) {
      logExportError('Source video was not ready for export', error, {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
      });
      setIsExporting(false);
      alert(`動画を書き出せませんでした: ${getErrorMessage(error)}`);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0';
    canvas.style.zIndex = '-9999';
    document.body.appendChild(canvas);

    const cleanupCanvas = () => {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cleanupCanvas();
      setIsExporting(false);
      alert('動画を書き出せませんでした: Canvas を初期化できません。');
      return;
    }

    try {
      assertExportFrameDimensions(canvas, video);
    } catch (error) {
      logExportError('Invalid export dimensions', error, {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
      });
      cleanupCanvas();
      setIsExporting(false);
      alert(`動画を書き出せませんでした: ${getErrorMessage(error)}`);
      return;
    }

    if (typeof canvas.captureStream !== 'function') {
      setIsExporting(false);
      alert('動画を書き出せませんでした: この端末では canvas.captureStream がサポートされていません。');
      cleanupCanvas();
      return;
    }

    let recorderSupport: CanvasRecorderSupportResult | undefined;
    if (Capacitor.getPlatform() === 'android') {
      recorderSupport = await runCanvasRecorderSmokeTest();
      logExportInfo('Android canvas recorder preflight completed', {
        exportMode,
        selectedMimeType: recorderSupport.selectedMimeType || '(none)',
        testedMimeTypes: recorderSupport.testedMimeTypes,
        testedMimeTypeResults: recorderSupport.testedMimeTypeResults,
        testRecorderChunkCount: recorderSupport.testRecorderChunkCount,
        testRecorderBlobSize: recorderSupport.testRecorderBlobSize,
        isCanvasRecorderSupportedOnThisDevice: recorderSupport.isCanvasRecorderSupportedOnThisDevice,
      });

      if (!recorderSupport.isCanvasRecorderSupportedOnThisDevice || !recorderSupport.selectedMimeInfo) {
        setIsExporting(false);
        cleanupCanvas();
        alert(getCanvasRecorderUnsupportedMessage());
        return;
      }
    }

    const canvasStream = canvas.captureStream(30);
    logExportInfo('Canvas capture stream created', {
      width,
      height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      videoReadyState: video.readyState,
      canvasVideoTrackStates: getTrackReadyStates(canvasStream),
      exportMode,
      isNativePlatform: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform(),
    });
    
    let audioTracks: MediaStreamTrack[] = [];
    try {
      const captureVideoStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream
        ? (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream()
        : (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();
      if (captureVideoStream) {
        audioTracks = captureVideoStream.getAudioTracks();
      }
    } catch (error) {
      logExportError('Could not capture audio tracks from source video; continuing without audio', error);
    }

    const shouldAttachAudioTracks = !(Capacitor.getPlatform() === 'android' && recorderSupport?.selectedMimeInfo?.mimeType && !recorderSupport.selectedMimeInfo.mimeType.includes('opus'));
    if (shouldAttachAudioTracks) {
      audioTracks.forEach(track => canvasStream.addTrack(track));
    }
    logExportInfo('Audio tracks attached to export stream', {
      audioTrackCount: shouldAttachAudioTracks ? audioTracks.length : 0,
      skippedAudioTrackCount: shouldAttachAudioTracks ? 0 : audioTracks.length,
      selectedMimeType: recorderSupport?.selectedMimeType,
      reason: shouldAttachAudioTracks ? 'attached' : 'android selected video-only mimeType',
    });

    let mediaRecorder: MediaRecorder;
    let mimeInfo: ExportMimeInfo;
    try {
      if (recorderSupport?.selectedMimeInfo) {
        mediaRecorder = createMediaRecorderWithMimeInfo(canvasStream, recorderSupport.selectedMimeInfo);
        const actualMimeType = mediaRecorder.mimeType || recorderSupport.selectedMimeInfo.mimeType || 'video/webm';
        mimeInfo = {
          mimeType: actualMimeType,
          extension: getExtensionForMimeType(actualMimeType),
        };
      } else {
        const recorderConfig = createMediaRecorder(canvasStream);
        mediaRecorder = recorderConfig.recorder;
        mimeInfo = recorderConfig.mimeInfo;
      }
    } catch (error) {
      logExportError('Failed to create MediaRecorder', error, {
        selectedMimeType: recorderSupport?.selectedMimeType,
        supportedMimeTypes: getSupportedMimeTypes().map(({ mimeType }) => mimeType),
      });
      setIsExporting(false);
      cleanupCanvas();
      alert(`動画を書き出せませんでした: ${getErrorMessage(error)}`);
      return;
    }

    const chunks: Blob[] = [];
    let exportAbortMessage = '';
    let recordingStartTime = 0;
    let recordingStopTime = 0;
    let renderedFrameCount = 0;
    let sampledFrameCount = 0;
    let sampledNonBlackFrameCount = 0;
    let sampledVisibleFrameCount = 0;
    let drawImageErrorCount = 0;
    let onDataAvailableCalledCount = 0;
    let firstDataAvailableTimeMs: number | undefined;
    let mediaRecorderErrorMessage = '';

    const stopExportRecording = (reason: string) => {
      if (mediaRecorder.state === 'inactive') return;

      recordingStopTime = performance.now();
      logExportInfo('Stopping MediaRecorder', {
        reason,
        mediaRecorderState: mediaRecorder.state,
        recorderMimeType: mediaRecorder.mimeType,
        renderedFrameCount,
        sampledFrameCount,
        sampledNonBlackFrameCount,
        sampledVisibleFrameCount,
        drawImageErrorCount,
        onDataAvailableCalledCount,
        firstDataAvailableTimeMs,
        chunksLength: chunks.length,
        chunkSizes: chunks.map(chunk => chunk.size),
        canvasVideoTrackStates: getTrackReadyStates(canvasStream),
      });

      requestRecorderData(mediaRecorder, 'real export before stop', {
        exportMode,
        renderedFrameCount,
        sampledNonBlackFrameCount,
        sampledVisibleFrameCount,
        realRecorderChunkCount: chunks.length,
      });

      mediaRecorder.stop();
    };

    mediaRecorder.ondataavailable = (e) => {
      onDataAvailableCalledCount += 1;
      firstDataAvailableTimeMs ??= recordingStartTime ? performance.now() - recordingStartTime : 0;
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
      logExportInfo('MediaRecorder dataavailable event received', {
        chunkSize: e.data?.size || 0,
        chunkType: e.data?.type || '',
        chunkCount: chunks.length,
        chunkSizes: chunks.map(chunk => chunk.size),
        ondataavailableCalledCount: onDataAvailableCalledCount,
        firstDataAvailableTimeMs,
        mediaRecorderState: mediaRecorder.state,
        renderedFrameCount,
        sampledNonBlackFrameCount,
        sampledVisibleFrameCount,
        realRecorderChunkCount: chunks.length,
        realRecorderBlobSize: chunks.reduce((sum, chunk) => sum + chunk.size, 0),
      });
    };

    mediaRecorder.onstop = async () => {
      cleanupCanvas();

      try {
        const recorderMimeType = mediaRecorder.mimeType || mimeInfo.mimeType || 'video/webm';
        const finalMimeInfo = {
          mimeType: recorderMimeType,
          extension: getExtensionForMimeType(recorderMimeType),
        } satisfies ExportMimeInfo;
        const blob = new Blob(chunks, { type: recorderMimeType });
        const recordedDurationMs = recordingStartTime && recordingStopTime
          ? recordingStopTime - recordingStartTime
          : 0;
        const blobDurationMs = blob.size > 0 ? await getBlobVideoDurationMs(blob) : null;
        const realRecorderBlobSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
        const diagnostics = {
          exportMode,
          platform: Capacitor.getPlatform(),
          isNativePlatform: Capacitor.isNativePlatform(),
          recorderMimeType,
          selectedMimeType: mimeInfo.mimeType || '(browser default)',
          finalMimeType: finalMimeInfo.mimeType,
          testedMimeTypes: recorderSupport?.testedMimeTypes || getSupportedMimeTypes().map(({ mimeType }) => mimeType),
          testedMimeTypeResults: recorderSupport?.testedMimeTypeResults || [],
          testRecorderChunkCount: recorderSupport?.testRecorderChunkCount ?? 'not_run',
          testRecorderBlobSize: recorderSupport?.testRecorderBlobSize ?? 'not_run',
          isCanvasRecorderSupportedOnThisDevice: recorderSupport?.isCanvasRecorderSupportedOnThisDevice ?? 'not_tested',
          extension: finalMimeInfo.extension,
          mediaRecorderState: mediaRecorder.state,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          videoReadyState: video.readyState,
          canvasVideoTrackStates: getTrackReadyStates(canvasStream),
          canvasStreamTrackReadyState: getTrackReadyStates(canvasStream).join('|') || 'none',
          renderedFrameCount,
          sampledFrameCount,
          sampledNonBlackFrameCount,
          sampledVisibleFrameCount,
          drawImageErrorCount,
          ondataavailableCalledCount: onDataAvailableCalledCount,
          firstDataAvailableTimeMs: firstDataAvailableTimeMs ?? 'none',
          chunkCount: chunks.length,
          chunkSizes: chunks.map(chunk => chunk.size),
          realRecorderChunkCount: chunks.length,
          realRecorderBlobSize,
          blobType: blob.type,
          blobSize: blob.size,
          recordingStartTime,
          recordingStopTime,
          recordedDurationMs,
          blobDurationMs: blobDurationMs ?? 'unknown',
        };

        logExportInfo('MediaRecorder stopped', diagnostics);

        if (exportAbortMessage) {
          throw new Error(`${exportAbortMessage} ${formatExportDiagnostics(diagnostics)}`);
        }

        if (mediaRecorderErrorMessage) {
          throw new Error(`MediaRecorderエラーが発生したため保存しません。${mediaRecorderErrorMessage} ${formatExportDiagnostics(diagnostics)}`);
        }

        const canvasVideoTrackStates = getTrackReadyStates(canvasStream);
        const hasLiveCanvasVideoTrack = canvasVideoTrackStates.includes('live');
        const hasKnownTooShortBlobDuration = blobDurationMs !== null && blobDurationMs < MIN_VALID_RECORDED_DURATION_MS;
        const validationFailures = [
          chunks.length === 0 ? 'chunkCount === 0' : '',
          blob.size < MIN_VALID_EXPORT_BLOB_BYTES ? `blob.size < ${MIN_VALID_EXPORT_BLOB_BYTES}` : '',
          recordedDurationMs < MIN_VALID_RECORDED_DURATION_MS ? `recordedDurationMs < ${MIN_VALID_RECORDED_DURATION_MS}` : '',
          renderedFrameCount === 0 ? 'renderedFrameCount === 0' : '',
          exportMode === 'composite' && sampledNonBlackFrameCount === 0 ? 'composite sampledNonBlackFrameCount === 0' : '',
          exportMode === 'overlayOnly' && sampledVisibleFrameCount === 0 ? 'overlayOnly sampledVisibleFrameCount === 0' : '',
          drawImageErrorCount > 0 ? `drawImageErrorCount > 0 (${drawImageErrorCount})` : '',
          onDataAvailableCalledCount === 0 ? 'ondataavailable called count === 0' : '',
          canvas.width <= 0 || canvas.height <= 0 ? 'canvas size is 0' : '',
          video.videoWidth <= 0 || video.videoHeight <= 0 ? 'video size is 0' : '',
          !hasLiveCanvasVideoTrack ? 'canvasVideoTrackStates does not include live' : '',
          hasKnownTooShortBlobDuration ? `blobDurationMs < ${MIN_VALID_RECORDED_DURATION_MS}` : '',
        ].filter(Boolean);

        if (blobDurationMs === null) {
          logExportInfo('Blob duration is unknown; treating as validation warning only', {
            ...diagnostics,
            warning: 'Android WebView WebM may not expose metadata duration through HTMLVideoElement',
          });
        }

        logExportInfo('Pre-save export validation result', {
          ...diagnostics,
          validationStatus: validationFailures.length > 0 ? 'failed' : blobDurationMs === null ? 'warning_save_allowed' : 'passed',
          validationFailures,
        });

        if (validationFailures.length > 0) {
          throw new Error(`この端末では動画合成出力に失敗しました。壊れた動画または黒画面動画を保存しません。failures=${validationFailures.join('|')}, ${formatExportDiagnostics(diagnostics)}`);
        }

        const previewProbe = await probeBlobPlayback(blob);
        logExportInfo('Blob preview playback probe completed', {
          ...diagnostics,
          previewProbe,
          note: previewProbe.canPlay ? 'アプリ内プレビューで再生可能です。' : 'アプリ内プレビューで再生確認できませんでした。WebM互換性または自動再生制限の可能性があります。',
        });

        await saveVideoBlob(blob, finalMimeInfo);
      } catch (error) {
        logExportError('Failed to save exported video', error, {
          platform: Capacitor.getPlatform(),
          isNativePlatform: Capacitor.isNativePlatform(),
          chunkCount: chunks.length,
          chunkSizes: chunks.map(chunk => chunk.size),
          recorderMimeType: mediaRecorder.mimeType,
          mediaRecorderState: mediaRecorder.state,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          videoReadyState: video.readyState,
          canvasVideoTrackStates: getTrackReadyStates(canvasStream),
          renderedFrameCount,
          sampledFrameCount,
          sampledNonBlackFrameCount,
          sampledVisibleFrameCount,
          drawImageErrorCount,
          ondataavailableCalledCount: onDataAvailableCalledCount,
          firstDataAvailableTimeMs: firstDataAvailableTimeMs ?? 'none',
          realRecorderChunkCount: chunks.length,
          realRecorderBlobSize: chunks.reduce((sum, chunk) => sum + chunk.size, 0),
          selectedMimeType: mimeInfo.mimeType || '(browser default)',
          testedMimeTypes: recorderSupport?.testedMimeTypes || getSupportedMimeTypes().map(({ mimeType }) => mimeType),
          testRecorderChunkCount: recorderSupport?.testRecorderChunkCount ?? 'not_run',
          testRecorderBlobSize: recorderSupport?.testRecorderBlobSize ?? 'not_run',
          isCanvasRecorderSupportedOnThisDevice: recorderSupport?.isCanvasRecorderSupportedOnThisDevice ?? 'not_tested',
          recordingStartTime,
          recordingStopTime,
          recordedDurationMs: recordingStartTime && recordingStopTime ? recordingStopTime - recordingStartTime : 0,
        });
        alert(`この端末では動画合成出力に対応していない可能性があります。0秒または壊れた動画は保存しません。
原因: ${getErrorMessage(error)}
代替手段: CSV出力、元動画保存、プロジェクトZIP保存、オーバーレイ設定JSON保存を利用してください。`);
      } finally {
        setIsExporting(false);
      }
    };

    mediaRecorder.onerror = (event) => {
      mediaRecorderErrorMessage = getErrorMessage(event);
      exportAbortMessage = `動画の書き出し中にMediaRecorderエラーが発生しました。mimeType=${mediaRecorder.mimeType || 'unknown'}`;
      logExportError('MediaRecorder failed during export', event, {
        mimeType: mediaRecorder.mimeType,
        state: mediaRecorder.state,
        sampledNonBlackFrameCount,
        sampledVisibleFrameCount,
        drawImageErrorCount,
        ondataavailableCalledCount: onDataAvailableCalledCount,
      });
      stopExportRecording('MediaRecorder error');
    };

    const originalTime = video.currentTime;
    const originalPlaybackRate = video.playbackRate;
    video.playbackRate = 1.0;

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
          stopExportRecording('composite reached video end');
          video.pause();
          video.currentTime = originalTime;
          video.playbackRate = originalPlaybackRate;
          return;
        }
      } else {
        t = performance.now() - overlayStartTime;
        if (t >= video.duration * 1000) {
          isStopped = true;
          stopExportRecording('overlayOnly reached duration');
          return;
        }
      }

      try {
        assertExportFrameDimensions(canvas, video);
      } catch (error) {
        isStopped = true;
        logExportError('Export frame dimensions became invalid during recording', error, {
          recorderMimeType: mediaRecorder.mimeType,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
        });
        exportAbortMessage = '録画中にcanvasまたは動画サイズが不正になったため、書き出しを中止しました。';
        stopExportRecording('export frame dimensions invalid');
        return;
      }

      ctx.clearRect(0, 0, width, height);
      if (exportMode === 'composite') {
        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch (error) {
          drawImageErrorCount += 1;
          isStopped = true;
          exportAbortMessage = `動画フレームをcanvasへ描画できず、書き出しを中止しました。原因: ${getErrorMessage(error)}`;
          logExportError('ctx.drawImage(video) failed during export', error, {
            recorderMimeType: mediaRecorder.mimeType,
            mediaRecorderState: mediaRecorder.state,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            videoReadyState: video.readyState,
            canvasVideoTrackStates: getTrackReadyStates(canvasStream),
            renderedFrameCount,
          });
          stopExportRecording('drawImage failed during export');
          return;
        }
      }
      renderedFrameCount += 1;
      const shouldSampleFrame = renderedFrameCount === 1 || renderedFrameCount % NON_BLACK_SAMPLE_INTERVAL_FRAMES === 0;
      if (shouldSampleFrame) {
        sampledFrameCount += 1;
        if (exportMode === 'composite') {
          try {
            if (isSampleNonBlack(ctx, width, height)) {
              sampledNonBlackFrameCount += 1;
            }
          } catch (error) {
            logExportError('Composite drawImage pixel sampling failed', error, {
              exportMode,
              renderedFrameCount,
              sampledFrameCount,
              sampledNonBlackFrameCount,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
            });
          }
        }
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


      if (shouldSampleFrame) {
        try {
          if (exportMode === 'overlayOnly' && isSampleNonBlack(ctx, width, height)) {
            sampledNonBlackFrameCount += 1;
          }
          if (isSampleVisible(ctx, width, height)) {
            sampledVisibleFrameCount += 1;
          }
        } catch (error) {
          logExportError('Overlay/visibility pixel sampling failed', error, {
            exportMode,
            renderedFrameCount,
            sampledFrameCount,
            sampledNonBlackFrameCount,
            sampledVisibleFrameCount,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
          });
        }
      }

      if (renderedFrameCount === 1 || renderedFrameCount % 30 === 0) {
        logExportInfo('Export frame rendered', {
          exportMode,
          renderedFrameCount,
          sampledFrameCount,
          sampledNonBlackFrameCount,
          sampledVisibleFrameCount,
          drawImageErrorCount,
          currentTime: video.currentTime,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          recorderMimeType: mediaRecorder.mimeType,
          realRecorderChunkCount: chunks.length,
        });
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

    const drawFirstFrameBeforeRecording = async () => {
      await waitForSeek(video, 0);
      assertExportFrameDimensions(canvas, video);
      ctx.clearRect(0, 0, width, height);
      if (exportMode === 'composite') {
        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch (error) {
          logExportError('ctx.drawImage(video) failed before recording', error, {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            videoReadyState: video.readyState,
            canvasVideoTrackStates: getTrackReadyStates(canvasStream),
          });
          throw error;
        }
      }
      await waitForAnimationFrame();
      await waitForAnimationFrame();

      const canvasVideoTrackStates = getTrackReadyStates(canvasStream);
      if (canvasVideoTrackStates.length === 0 || canvasVideoTrackStates.some(state => state !== 'live')) {
        throw new Error(`canvas.captureStream の video track が live ではありません。trackStates=${canvasVideoTrackStates.join('|') || 'none'}`);
      }

      logExportInfo('First canvas frame drawn before MediaRecorder.start', {
        exportMode,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        currentTime: video.currentTime,
        readyState: video.readyState,
        canvasVideoTrackStates,
      });
    };

    try {
      await drawFirstFrameBeforeRecording();
    } catch (error) {
      logExportError('Failed to draw first frame before recording', error, {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
      });
      cleanupCanvas();
      setIsExporting(false);
      alert(`動画の最初のフレームを描画できず、書き出しを中止しました。原因: ${getErrorMessage(error)}`);
      return;
    }

    try {
      recordingStartTime = performance.now();
      recordingStopTime = 0;
      mediaRecorder.start(250);
      requestRecorderData(mediaRecorder, 'real export start', { exportMode });
      window.setTimeout(() => requestRecorderData(mediaRecorder, 'real export 1s', {
        exportMode,
        realRecorderChunkCount: chunks.length,
        realRecorderBlobSize: chunks.reduce((sum, chunk) => sum + chunk.size, 0),
      }), 1000);
      logExportInfo('MediaRecorder started', {
        requestedMimeType: mimeInfo.mimeType,
        recorderMimeType: mediaRecorder.mimeType,
        extension: getExtensionForMimeType(mediaRecorder.mimeType || mimeInfo.mimeType),
        timesliceMs: 250,
        selectedMimeType: mimeInfo.mimeType || '(browser default)',
        testedMimeTypes: recorderSupport?.testedMimeTypes || getSupportedMimeTypes().map(({ mimeType }) => mimeType),
        testRecorderChunkCount: recorderSupport?.testRecorderChunkCount ?? 'not_run',
        testRecorderBlobSize: recorderSupport?.testRecorderBlobSize ?? 'not_run',
        isCanvasRecorderSupportedOnThisDevice: recorderSupport?.isCanvasRecorderSupportedOnThisDevice ?? 'not_tested',
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        videoReadyState: video.readyState,
        mediaRecorderState: mediaRecorder.state,
        canvasVideoTrackStates: getTrackReadyStates(canvasStream),
        recordingStartTime,
        platform: Capacitor.getPlatform(),
        isNativePlatform: Capacitor.isNativePlatform(),
      });
    } catch (error) {
      logExportError('MediaRecorder.start failed', error, {
        mimeType: mediaRecorder.mimeType,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      cleanupCanvas();
      setIsExporting(false);
      alert(`動画の録画ストリームを開始できませんでした。原因: ${getErrorMessage(error)}`);
      return;
    }

    if (exportMode === 'composite') {
      try {
        await video.play();
      } catch (error) {
        logExportError('Source video playback failed after recording started', error, { exportMode, recorderMimeType: mediaRecorder.mimeType });
        exportAbortMessage = `動画の再生を開始できず、書き出しを中止しました。原因: ${getErrorMessage(error)}`;
        stopExportRecording('source video playback failed after recording started');
        video.playbackRate = originalPlaybackRate;
        setIsExporting(false);
        alert(`動画の再生を開始できず、書き出しを中止しました。原因: ${getErrorMessage(error)}`);
        return;
      }
    }

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
