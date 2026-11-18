// app/work-orders/loading.tsx
export default function WorkOrdersLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse max-w-7xl mx-auto">
      {/* Header bar skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-7 bg-neutral-200 rounded-md w-48"></div>
          <div className="h-4 bg-neutral-100 rounded-md w-72"></div>
        </div>
        <div className="h-10 bg-neutral-200 rounded-lg w-32"></div>
      </div>

      {/* Filter tabs skeleton */}
      <div className="flex gap-2 border-b border-neutral-200 pb-3">
        <div className="h-9 bg-neutral-200 rounded-lg w-24"></div>
        <div className="h-9 bg-neutral-100 rounded-lg w-24"></div>
        <div className="h-9 bg-neutral-100 rounded-lg w-24"></div>
      </div>

      {/* Data table skeleton */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-100 bg-neutral-50/50 flex gap-4">
          <div className="h-4 bg-neutral-200 rounded w-1/4"></div>
          <div className="h-4 bg-neutral-200 rounded w-1/4"></div>
          <div className="h-4 bg-neutral-200 rounded w-1/4"></div>
          <div className="h-4 bg-neutral-200 rounded w-1/4"></div>
        </div>
        <div className="divide-y divide-neutral-100">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="h-5 bg-neutral-100 rounded w-1/4"></div>
              <div className="h-5 bg-neutral-100 rounded w-1/4"></div>
              <div className="h-5 bg-neutral-100 rounded w-1/4"></div>
              <div className="h-5 bg-neutral-100 rounded w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}