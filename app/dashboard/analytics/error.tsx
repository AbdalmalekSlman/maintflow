'use client';

import { useEffect } from 'react';

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Analytics Module Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[450px] p-8 bg-white rounded-xl shadow-sm border border-neutral-200">
      <h2 className="text-xl font-semibold text-neutral-900 mb-1">Failed to load Equipment</h2>
      <p className="text-sm text-neutral-500 mb-6 text-center max-w-md">
        {error.message || 'An unexpected error occurred while fetching analytics records.'}
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium shadow-sm"
      >
        Try again
      </button>
    </div>
  );
}