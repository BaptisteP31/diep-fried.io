import {
  loadDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
} from '../state/display-settings';

/** Réglages purement locaux, sans effet sur les règles du salon. */
export function setupDisplaySettings(onChange: (settings: DisplaySettings) => void): void {
  const grid = document.getElementById('settings-grid') as HTMLInputElement;
  const quality = document.getElementById('settings-quality') as HTMLSelectElement;
  const settings = loadDisplaySettings();
  grid.checked = settings.grid;
  quality.value = String(settings.maxDpr);
  onChange(settings);
  const update = () => {
    const maxDpr = quality.value === '1' ? 1 : quality.value === '1.5' ? 1.5 : 2;
    const next = { grid: grid.checked, maxDpr } as DisplaySettings;
    saveDisplaySettings(next);
    onChange(next);
  };
  grid.addEventListener('change', update);
  quality.addEventListener('change', update);
}
