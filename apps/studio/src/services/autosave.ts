import type { ArchitectureModel } from '@arch-atlas/core-model';

const STORAGE_KEY = 'arch-atlas-autosave';
const AUTOSAVE_INTERVAL = 5000; // 5 seconds

export class AutosaveManager {
  private timer: NodeJS.Timeout | null = null;

  public startAutosave(getModel: () => ArchitectureModel | null): void {
    this.stopAutosave();
    this.timer = setInterval(() => {
      const model = getModel();
      if (model) {
        this.saveToLocalStorage(model);
      }
    }, AUTOSAVE_INTERVAL);
  }

  public stopAutosave(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public saveToLocalStorage(model: ArchitectureModel): void {
    try {
      const json = JSON.stringify(model, null, 2);
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem(`${STORAGE_KEY}-timestamp`, new Date().toISOString());
    } catch (error) {
      console.error('Failed to autosave model:', error);
    }
  }

  public loadFromLocalStorage(): ArchitectureModel | null {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return null;
      return JSON.parse(json) as ArchitectureModel;
    } catch (error) {
      console.error('Failed to load autosaved model:', error);
      return null;
    }
  }

  public clearAutosave(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(`${STORAGE_KEY}-timestamp`);
  }

  public getAutosaveTimestamp(): string | null {
    return localStorage.getItem(`${STORAGE_KEY}-timestamp`);
  }
}
