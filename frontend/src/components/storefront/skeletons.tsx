function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-secondary ${className}`} />
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Block className="aspect-square w-full" />
          <Block className="mt-3 h-3 w-1/3" />
          <Block className="mt-2 h-4 w-4/5" />
          <Block className="mt-4 h-5 w-1/4" />
        </div>
      ))}
    </div>
  )
}

export function ListingSkeleton() {
  return (
    <div className="shell pb-24 pt-6" role="status" aria-label="Loading products">
      <Block className="h-3 w-40" />
      <Block className="mt-6 h-12 w-72" />
      <Block className="mt-4 h-4 w-96 max-w-full" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[232px_minmax(0,1fr)] xl:gap-14">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 8 }, (_, i) => (
            <Block key={i} className="h-6 w-full" />
          ))}
        </div>
        <ProductGridSkeleton count={8} />
      </div>
    </div>
  )
}

export function ProductDetailSkeleton() {
  return (
    <div className="shell pt-6" role="status" aria-label="Loading product">
      <Block className="h-3 w-56" />
      <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <Block className="aspect-square lg:col-span-7" />
        <div className="space-y-4 lg:col-span-5">
          <Block className="h-9 w-48" />
          <Block className="h-12 w-4/5" />
          <Block className="h-10 w-32" />
          <Block className="h-14 w-full" />
          <Block className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}
