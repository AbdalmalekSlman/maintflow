// app/work-orders/error.tsx
'use client';

import { useEffect } from 'react';

export default function WorkOrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to your error reporting service if configured
    console.error('Work Orders Module Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[450px] p-8 bg-white rounded-xl shadow-sm border border-neutral-200">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-neutral-900 mb-1">Failed to load Work Orders</h2>
      <p className="text-sm text-neutral-500 mb-6 text-center max-w-md">
        {error.message || 'An unexpected error occurred while fetching maintenance records from the database.'}
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