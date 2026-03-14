'use client';

import { Suspense } from 'react';
import StudioPage from './studio-page';

export default function PageWrapper() {
  return (
    <Suspense fallback={<div className="loading-screen">Loading Arch Atlas Studio...</div>}>
      <StudioPage />
    </Suspense>
  );
}
