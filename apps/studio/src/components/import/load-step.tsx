'use client';

import { useRef, type DragEvent, type ChangeEvent } from 'react';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import type { WizardState, WizardAction } from '@/lib/import/types';
import { parseReviewYaml } from '@/lib/import/parse-review';
import { parseModelFromText } from '@/services/import-export';

interface LoadStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  baseDiagram: ArchitectureModel | null;
  onBaseDiagramLoad: (model: ArchitectureModel | null) => void;
}

export function LoadStep({ state, dispatch, baseDiagram, onBaseDiagramLoad }: LoadStepProps) {
  const reviewInputRef = useRef<HTMLInputElement>(null);
  const archInputRef = useRef<HTMLInputElement>(null);

  function handleReviewFile(file: File): void {
    file
      .text()
      .then((text) => {
        try {
          const { file: reviewFile, candidates } = parseReviewYaml(text);
          dispatch({ type: 'LOAD_REVIEW', file: reviewFile, candidates });
        } catch (err) {
          dispatch({
            type: 'SET_PARSE_ERROR',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .catch((err: unknown) => {
        dispatch({
          type: 'SET_PARSE_ERROR',
          error: err instanceof Error ? err.message : 'Failed to read file',
        });
      });
  }

  function handleArchFile(file: File): void {
    file
      .text()
      .then((text) => {
        try {
          const model = parseModelFromText(text);
          dispatch({ type: 'CLEAR_BASE_DIAGRAM_ERROR' });
          onBaseDiagramLoad(model);
        } catch (err) {
          dispatch({
            type: 'SET_BASE_DIAGRAM_ERROR',
            error: err instanceof Error ? err.message : String(err),
          });
          onBaseDiagramLoad(null);
        }
      })
      .catch((err: unknown) => {
        dispatch({
          type: 'SET_BASE_DIAGRAM_ERROR',
          error: err instanceof Error ? err.message : 'Failed to read file',
        });
        onBaseDiagramLoad(null);
      });
  }

  function onReviewChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) handleReviewFile(file);
  }

  function onArchChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) handleArchFile(file);
  }

  function onReviewDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onReviewDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleReviewFile(file);
  }

  function onArchDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onArchDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleArchFile(file);
  }

  const repoCount = state.reviewFile?.source_repos.length ?? 0;
  const candidateCount = state.candidates.length;
  const reviewLoaded = state.reviewFile !== null;

  return (
    <div className="iw-step-content">
      <h2 className="iw-step-title">Load Files</h2>
      <p className="iw-step-subtitle">
        Upload your architecture.review.yaml file and optionally an existing architecture.arch.json
        to merge with.
      </p>

      <div className="iw-dropzone-grid">
        {/* Review YAML drop zone */}
        <div className="iw-dropzone-wrapper">
          <div
            className={`iw-dropzone${reviewLoaded ? ' iw-dropzone--loaded' : ''}`}
            onClick={() => reviewInputRef.current?.click()}
            onDragOver={onReviewDragOver}
            onDrop={onReviewDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') reviewInputRef.current?.click();
            }}
          >
            <input
              ref={reviewInputRef}
              type="file"
              accept=".yaml,.yml"
              className="iw-dropzone-input"
              onChange={onReviewChange}
            />
            <div className="iw-dropzone-icon">📄</div>
            <div className="iw-dropzone-label">
              <span className="iw-dropzone-filename">architecture.review.yaml</span>
              <span className="iw-dropzone-required">required</span>
            </div>
            {reviewLoaded ? (
              <div className="iw-dropzone-status iw-dropzone-status--success">Loaded</div>
            ) : (
              <div className="iw-dropzone-hint">Drop file or click to select</div>
            )}
          </div>

          {state.parseError && (
            <div className="iw-error-box">
              <strong>Parse error:</strong> {state.parseError}
            </div>
          )}

          {reviewLoaded && (
            <div className="iw-parse-summary">
              {repoCount} {repoCount === 1 ? 'repo' : 'repos'} · {candidateCount}{' '}
              {candidateCount === 1 ? 'candidate' : 'candidates'}
            </div>
          )}
        </div>

        {/* Arch JSON drop zone */}
        <div className="iw-dropzone-wrapper">
          <div
            className={`iw-dropzone${baseDiagram !== null ? ' iw-dropzone--loaded' : ''}`}
            onClick={() => archInputRef.current?.click()}
            onDragOver={onArchDragOver}
            onDrop={onArchDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') archInputRef.current?.click();
            }}
          >
            <input
              ref={archInputRef}
              type="file"
              accept=".json"
              className="iw-dropzone-input"
              onChange={onArchChange}
            />
            <div className="iw-dropzone-icon">🗂️</div>
            <div className="iw-dropzone-label">
              <span className="iw-dropzone-filename">architecture.arch.json</span>
              <span className="iw-dropzone-optional">optional</span>
            </div>
            {baseDiagram !== null ? (
              <div className="iw-dropzone-status iw-dropzone-status--success">
                Loaded — will merge on export
              </div>
            ) : (
              <div className="iw-dropzone-hint">Drop file or click to select</div>
            )}
          </div>

          {state.baseDiagramError && (
            <div className="iw-error-box">
              <strong>Parse error:</strong> {state.baseDiagramError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
