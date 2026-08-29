'use client';

import { useState, type KeyboardEvent, type ChangeEvent } from 'react';
import type { WizardState, WizardAction } from '@/lib/import/types';

interface SystemsStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function SystemsStep({ state, dispatch }: SystemsStepProps) {
  const [newSystemName, setNewSystemName] = useState('');

  const allRepos = state.reviewFile?.source_repos ?? [];

  // Repos not assigned to any system
  const assignedRepos = new Set<string>(state.systems.flatMap((s) => s.repoNames));
  const ungroupedRepos = allRepos.filter((r) => !assignedRepos.has(r));

  function handleCreateSystem(): void {
    const name = newSystemName.trim();
    if (!name) return;
    const id = 'sys-' + Date.now().toString(36);
    dispatch({ type: 'CREATE_SYSTEM', id, name });
    setNewSystemName('');
  }

  function handleNewSystemKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleCreateSystem();
  }

  function handleAssignChange(repoName: string, e: ChangeEvent<HTMLSelectElement>): void {
    const systemId = e.target.value;
    if (!systemId) return;
    dispatch({ type: 'ASSIGN_REPO_TO_SYSTEM', repoName, systemId });
  }

  function handleUnassign(repoName: string): void {
    dispatch({ type: 'UNASSIGN_REPO', repoName });
  }

  function handleDeleteSystem(systemId: string): void {
    dispatch({ type: 'DELETE_SYSTEM', systemId });
  }

  return (
    <div className="iw-step-content">
      <h2 className="iw-step-title">Define Software Systems</h2>
      <p className="iw-step-subtitle">
        Group your repositories into named software systems. Ungrouped repos become their own
        system.
      </p>

      <div className="iw-systems-layout">
        {/* Left: ungrouped repos */}
        <div className="iw-systems-panel">
          <h3 className="iw-panel-heading">Ungrouped Repos</h3>

          {ungroupedRepos.length === 0 ? (
            <p className="iw-panel-empty">All repos are assigned to a system.</p>
          ) : (
            <ul className="iw-repo-list">
              {ungroupedRepos.map((repo) => (
                <li key={repo} className="iw-repo-item">
                  <span className="iw-repo-name">{repo}</span>
                  {state.systems.length > 0 && (
                    <select
                      className="iw-repo-assign-select"
                      defaultValue=""
                      onChange={(e) => handleAssignChange(repo, e)}
                      aria-label={`Assign ${repo} to system`}
                    >
                      <option value="" disabled>
                        Assign to…
                      </option>
                      {state.systems.map((sys) => (
                        <option key={sys.id} value={sys.id}>
                          {sys.name}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: software systems */}
        <div className="iw-systems-panel">
          <h3 className="iw-panel-heading">Software Systems</h3>

          {state.systems.length === 0 ? (
            <p className="iw-panel-empty">No systems yet. Create one below.</p>
          ) : (
            <ul className="iw-system-card-list">
              {state.systems.map((sys) => (
                <li key={sys.id} className="iw-system-card">
                  <div className="iw-system-card-header">
                    <span className="iw-system-card-name">{sys.name}</span>
                    <button
                      type="button"
                      className="iw-btn-icon"
                      onClick={() => handleDeleteSystem(sys.id)}
                      aria-label={`Delete system ${sys.name}`}
                    >
                      ✕
                    </button>
                  </div>

                  {sys.repoNames.length === 0 ? (
                    <p className="iw-system-empty">No repos assigned</p>
                  ) : (
                    <div className="iw-repo-tags">
                      {sys.repoNames.map((repo) => (
                        <span key={repo} className="iw-repo-tag">
                          {repo}
                          <button
                            type="button"
                            className="iw-repo-tag-remove"
                            onClick={() => handleUnassign(repo)}
                            aria-label={`Remove ${repo} from ${sys.name}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* New system input */}
          <div className="iw-new-system-row">
            <input
              type="text"
              className="iw-input"
              placeholder="New system name…"
              value={newSystemName}
              onChange={(e) => setNewSystemName(e.target.value)}
              onKeyDown={handleNewSystemKeyDown}
              aria-label="New system name"
            />
            <button
              type="button"
              className="iw-btn iw-btn--secondary"
              onClick={handleCreateSystem}
              disabled={!newSystemName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <p className="iw-step-hint">
        Tip: Skip this step and each repository will become its own system automatically.
      </p>
    </div>
  );
}
