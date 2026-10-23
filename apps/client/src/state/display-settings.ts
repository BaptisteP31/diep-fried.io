import { readStored, writeStored } from './storage';

export interface DisplaySettings {
  grid: boolean;
  maxDpr: 1 | 1.5 | 2;
}
const KEY = 'diep-fried:display';

export function loadDisplaySettings(): DisplaySettings {
  try {
    const value = JSON.parse(readStored(KEY) ?? '{}');
    return {
      grid: value?.grid !== false,
      maxDpr: value?.maxDpr === 1 || value?.maxDpr === 1.5 ? value.maxDpr : 2,
    };
  } catch {
    return { grid: true, maxDpr: 2 };
  }
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  writeStored(KEY, JSON.stringify(settings));
}
