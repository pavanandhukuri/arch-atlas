import { useReducer, type Dispatch } from 'react';
import type { WizardState, WizardAction, WizardStep, SystemGroup, ElementConfig } from './types';

const initialState: WizardState = {
  step: 1,
  reviewFile: null,
  parseError: null,
  baseDiagramError: null,
  candidates: [],
  systems: [],
  elements: [],
  selectedElementId: null,
  reviewFilter: 'all',
  editingCandidateId: null,
};

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'LOAD_REVIEW': {
      return {
        ...state,
        reviewFile: action.file,
        candidates: action.candidates,
        parseError: null,
        systems: [],
        elements: [],
        selectedElementId: null,
        reviewFilter: 'all',
        editingCandidateId: null,
      };
    }

    case 'SET_PARSE_ERROR': {
      return {
        ...state,
        parseError: action.error,
        reviewFile: null,
        candidates: [],
      };
    }

    case 'SET_BASE_DIAGRAM_ERROR': {
      return {
        ...state,
        baseDiagramError: action.error,
      };
    }

    case 'CLEAR_BASE_DIAGRAM_ERROR': {
      return {
        ...state,
        baseDiagramError: null,
      };
    }

    case 'NEXT_STEP': {
      const nextStep = Math.min(state.step + 1, 5) as WizardStep;
      return { ...state, step: nextStep };
    }

    case 'PREV_STEP': {
      const prevStep = Math.max(state.step - 1, 1) as WizardStep;
      return { ...state, step: prevStep };
    }

    case 'GO_TO_STEP': {
      return { ...state, step: action.step };
    }

    case 'CREATE_SYSTEM': {
      const newSystem: SystemGroup = {
        id: action.id,
        name: action.name,
        repoNames: [],
      };
      return {
        ...state,
        systems: [...state.systems, newSystem],
      };
    }

    case 'DELETE_SYSTEM': {
      // Remove the system; repos in it become unassigned
      return {
        ...state,
        systems: state.systems.filter((s) => s.id !== action.systemId),
        // Also clear systemId from any elements that were in this system
        elements: state.elements.map((el) =>
          el.systemId === action.systemId ? { ...el, systemId: undefined } : el
        ),
      };
    }

    case 'RENAME_SYSTEM': {
      return {
        ...state,
        systems: state.systems.map((s) =>
          s.id === action.systemId ? { ...s, name: action.name } : s
        ),
      };
    }

    case 'ASSIGN_REPO_TO_SYSTEM': {
      // Remove repo from any other system first, then add to target system
      const updatedSystems: SystemGroup[] = state.systems.map((s) => {
        if (s.id === action.systemId) {
          // Add repo if not already present
          if (s.repoNames.includes(action.repoName)) return s;
          return { ...s, repoNames: [...s.repoNames, action.repoName] };
        }
        // Remove repo from other systems
        if (s.repoNames.includes(action.repoName)) {
          return { ...s, repoNames: s.repoNames.filter((r) => r !== action.repoName) };
        }
        return s;
      });
      return { ...state, systems: updatedSystems };
    }

    case 'UNASSIGN_REPO': {
      return {
        ...state,
        systems: state.systems.map((s) => ({
          ...s,
          repoNames: s.repoNames.filter((r) => r !== action.repoName),
        })),
      };
    }

    case 'SET_CANDIDATE_STATUS': {
      return {
        ...state,
        candidates: state.candidates.map((c) =>
          c.id === action.id ? { ...c, status: action.status } : c
        ),
      };
    }

    case 'SET_CANDIDATE_OVERRIDE': {
      return {
        ...state,
        candidates: state.candidates.map((c) =>
          c.id === action.id
            ? { ...c, override_name: action.overrideName, override_type: action.overrideType }
            : c
        ),
      };
    }

    case 'ACCEPT_ALL_HIGH_CONFIDENCE': {
      return {
        ...state,
        candidates: state.candidates.map((c) =>
          c.confidence === 'high' && c.status === 'pending' ? { ...c, status: 'accepted' } : c
        ),
      };
    }

    case 'SET_REVIEW_FILTER': {
      return { ...state, reviewFilter: action.filter };
    }

    case 'SET_EDITING_CANDIDATE': {
      return { ...state, editingCandidateId: action.id };
    }

    case 'INIT_ELEMENTS': {
      return { ...state, elements: action.elements };
    }

    case 'UPDATE_ELEMENT': {
      const exists = state.elements.some((el) => el.id === action.config.id);
      const updatedElements: ElementConfig[] = exists
        ? state.elements.map((el) => (el.id === action.config.id ? action.config : el))
        : [...state.elements, action.config];
      return { ...state, elements: updatedElements };
    }

    case 'SELECT_ELEMENT': {
      return { ...state, selectedElementId: action.id };
    }

    default: {
      // Exhaustive check — TypeScript will error if a case is missing
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function useWizardState(): [WizardState, Dispatch<WizardAction>] {
  return useReducer(wizardReducer, initialState);
}
