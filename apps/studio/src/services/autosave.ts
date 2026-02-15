import type { ArchitectureModel } from '@arch-atlas/core-model';
import { validateModel } from '@arch-atlas/core-model';

const STORAGE_KEY = 'arch-atlas-autosave';
const AUTOSAVE_INTERVAL = 2000; // 2 seconds

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
      console.error('[Autosave] Failed to autosave model:', error);
    }
  }

  public loadFromLocalStorage(): ArchitectureModel | null {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) {
        return null;
      }
      
      let model = JSON.parse(json) as ArchitectureModel;
      
      // Validate the loaded model
      const errors = validateModel(model);
      if (errors.length > 0) {
        // Try to fix common validation errors automatically
        model = this.attemptAutoFix(model, errors);
        
        // Re-validate after fixes
        const remainingErrors = validateModel(model);
        if (remainingErrors.length > 0) {
          console.error('[Autosave] Unable to fix all validation errors:', remainingErrors);
        }
      }
      
      return model;
    } catch (error) {
      console.error('[Autosave] Failed to load autosaved model:', error);
      return null;
    }
  }

  private attemptAutoFix(model: ArchitectureModel, errors: any[]): ArchitectureModel {
    const fixedModel = { ...model };
    
    // Check for hierarchy errors - systems without landscape parents
    const hasHierarchyErrors = errors.some(e => 
      e.code === 'INVALID_HIERARCHY' && 
      e.message.includes('system') && 
      e.message.includes('landscape')
    );
    
    if (hasHierarchyErrors) {
      // Find or create a landscape element
      let landscape = fixedModel.elements.find(e => e.kind === 'landscape' && !e.parentId);
      
      if (!landscape) {
        // Create an implicit landscape
        landscape = {
          id: `landscape-${Date.now()}`,
          name: 'Architecture Landscape',
          kind: 'landscape',
          description: 'Top-level architecture landscape (auto-created)',
        };
        fixedModel.elements = [landscape, ...fixedModel.elements];
      }
      
      // Fix systems without parents
      fixedModel.elements = fixedModel.elements.map(element => {
        if (element.kind === 'system' && !element.parentId) {
          return { ...element, parentId: landscape!.id };
        }
        return element;
      });
    }
    
    return fixedModel;
  }

  public clearAutosave(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(`${STORAGE_KEY}-timestamp`);
  }

  public getAutosaveTimestamp(): string | null {
    return localStorage.getItem(`${STORAGE_KEY}-timestamp`);
  }
}
