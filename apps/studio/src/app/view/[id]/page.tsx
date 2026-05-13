import { Suspense } from 'react';
import { ViewerPage } from './viewer-page';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default function ViewPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
          }}
        >
          Loading diagram…
        </div>
      }
    >
      <ViewerPage fileId={params.id} />
    </Suspense>
  );
}
