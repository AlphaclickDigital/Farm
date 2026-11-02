"use client"

import { useState } from "react"
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function AuthHeading({
  title,
  description,
  icon,
}: {
  title: string
  description?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="mb-8">
      {icon && (
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">{icon}</div>
      )}
      <h1 className="font-serif text-[2rem] leading-tight font-semibold tracking-[-0.015em] text-foreground sm:text-[2.25rem]">
        {title}
      </h1>
      {description && <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}

/** Taller, card-backed input used across the auth forms. */
export function AuthInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input className={cn("h-11 rounded-lg bg-card px-3.5 text-[15px] md:text-[15px]", className)} {...props} />
}

export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <AuthInput type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label="Show password"
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  )
}

export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm leading-snug text-destructive"
    >
      <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean
  pendingLabel: string
  children: React.ReactNode
}) {
  return (
    <Button type="submit" size="lg" className="h-11 w-full rounded-lg text-[15px] font-semibold" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

export function OrDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-7 flex items-center gap-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      {children}
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
