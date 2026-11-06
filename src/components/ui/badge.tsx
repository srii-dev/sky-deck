import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        climbing:
          "border-success/40 bg-success/15 text-success font-display uppercase tracking-wider",
        descending:
          "border-primary/40 bg-primary/15 text-primary font-display uppercase tracking-wider",
        cruising: "border-accent/40 bg-accent/15 text-accent font-display uppercase tracking-wider",
        ground:
          "border-border bg-muted text-muted-foreground font-display uppercase tracking-wider",
        emergency:
          "border-destructive bg-destructive text-destructive-foreground font-display uppercase tracking-wider animate-emergency",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
