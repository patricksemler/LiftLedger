import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

const PADDING = {
  none: "",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
} as const;

interface CardOwnProps<E extends ElementType> {
  /** @default "div" */
  as?: E;
  /** @default "md" (p-4) */
  padding?: keyof typeof PADDING;
  /** Adds `@container` so children can use container-query breakpoints
   * (e.g. gym's chart panels). */
  container?: boolean;
  className?: string;
  children: ReactNode;
}

type CardProps<E extends ElementType> = CardOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof CardOwnProps<E>>;

/** The card wrapper (`rounded-md border border-border bg-surface-1`) used
 * across every panel/overview-card/list-card in the dashboard — previously
 * a hand-repeated class string at 30+ call sites (REFACTOR_PLAN.md Phase 6
 * step 1). `className` layers on top for the caller's own layout (flex/gap/
 * divide-y/etc.) — Card only owns the surface styling, not internal layout.
 * `as` also widens the accepted props to match that tag (e.g. `onSubmit`/
 * `noValidate` for `as="form"`), so callers don't need a cast. */
export function Card<E extends ElementType = "div">({
  as,
  padding = "md",
  container,
  className,
  children,
  ...rest
}: CardProps<E>) {
  const Tag = (as ?? "div") as ElementType;
  const classes = [
    "rounded-md border border-border bg-surface-1",
    container && "@container",
    PADDING[padding],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
