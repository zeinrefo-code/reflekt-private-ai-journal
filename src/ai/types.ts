/** Shared types for the Reflekt hybrid AI engine. */

export type AiPath = "ondevice" | "cloud" | "demo";

export type EngineMode = "auto" | "ondevice" | "cloud";

export interface EntryAnalysis {
  summary: string;
  themes: string[];
  /** Human label: Positive | Balanced | Reflective | Heavy */
  sentiment: string;
  /** -1 (very heavy) .. +1 (very positive) */
  sentimentScore: number;
}

export interface AiResult<T> {
  data: T;
  /** Which path actually produced this result. */
  path: AiPath;
  /** Short human-readable explanation of why this path was chosen. */
  reason: string;
}

export type OnDeviceState =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export interface EngineStatus {
  onDeviceState: OnDeviceState;
  onDeviceDetail: string;
  cloudReady: boolean;
  cloudDetail: string;
  mode: EngineMode;
}
