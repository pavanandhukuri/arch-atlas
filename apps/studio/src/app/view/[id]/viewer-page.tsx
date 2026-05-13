'use client';

import { useState, useEffect } from 'react';
import { DiagramViewer } from '@arch-atlas/viewer-components';
import { GoogleDriveProvider } from '@/services/storage/google-drive-provider';
import { useGoogleDriveAuth } from '@/hooks/useGoogleDriveAuth';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

interface ViewerPageProps {
  fileId: string;
}

export function ViewerPage({ fileId }: ViewerPageProps) {
  const driveAuth = useGoogleDriveAuth();
  const [model, setModel] = useState<ArchitectureModel | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driveAuth.isAuthenticated) return;

    const provider = new GoogleDriveProvider(driveAuth.accessToken!);
    setIsLoading(true);
    setError(null);

    provider
      .load({ ref: fileId, type: 'google-drive', fileName: '', lastKnownModified: null })
      .then((result) => {
        if (!result.success) {
          setError(
            'Could not load diagram. The file may have been deleted or you may not have access.'
          );
          return;
        }
        setModel(result.model);
        setView(result.model.views[0] ?? null);
      })
      .catch(() => {
        setError('An unexpected error occurred while loading the diagram.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [fileId, driveAuth.isAuthenticated]);

  if (!driveAuth.isAuthenticated && !isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <p>Sign in to view this diagram.</p>
        <button onClick={() => driveAuth.authorize()}>Sign in with Google</button>
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#ffffff' }}
    >
      <DiagramViewer model={model} view={view} isLoading={isLoading} error={error} />
    </div>
  );
}
