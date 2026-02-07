import { ArchitectureModel, validateModel, ValidationError } from '@arch-atlas/core-model';

export interface ModelState {
  model: ArchitectureModel | null;
  errors: ValidationError[];
  isDirty: boolean;
}

export class ModelStore {
  private state: ModelState = {
    model: null,
    errors: [],
    isDirty: false,
  };
  private listeners: Set<(state: ModelState) => void> = new Set();

  public getState(): ModelState {
    return { ...this.state };
  }

  public subscribe(listener: (state: ModelState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public loadModel(model: ArchitectureModel): void {
    const errors = validateModel(model);
    this.state = {
      model,
      errors,
      isDirty: false,
    };
    this.notify();
  }

  public updateModel(model: ArchitectureModel): void {
    const errors = validateModel(model);
    this.state = {
      model,
      errors,
      isDirty: true,
    };
    this.notify();
  }

  public clearDirty(): void {
    this.state.isDirty = false;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }
}
