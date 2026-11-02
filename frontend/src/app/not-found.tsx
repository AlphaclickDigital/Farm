import Link from "next/link"

export default function NotFound() {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-olive">Page not found</p>
      <h1 className="mt-4 max-w-xl font-serif text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
        This one isn&apos;t on the shelf
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        The page may have moved, or the product or farm is no longer listed.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/products"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Browse products
        </Link>
        <Link href="/vendors" className="inline-flex h-11 items-center justify-center rounded-md border px-6 text-sm font-semibold hover:bg-secondary">
          Discover farms
        </Link>
      </div>
    </div>
  )
}
