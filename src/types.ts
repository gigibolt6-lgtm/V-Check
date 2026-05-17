export interface SpeedUpConfig {
  multiplier: number;
  delaySeconds: number;
}

export interface Checkpoint {
  id: string;
  time: number; // in milliseconds from video start
  stateName: string;
  speedUp?: SpeedUpConfig;
}

export interface ElementStyle {
  x: number;
  y: number;
  scale: number;
  fontSize: number;
  textColor: string;
  bgColor: string;
  bgOpacity: number;
  fontFamily: string;
  width?: number;
  height?: number;
}

export interface OverlayConfig {
  titleText: string;
  panel: ElementStyle;
  title: ElementStyle;
  time: ElementStyle;
}

export type AppMode = 'record' | 'edit' | 'settings';

export interface VideoData {
  url: string;
  duration: number;
  checkpoints: Checkpoint[];
}
