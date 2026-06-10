'use client';

interface EmptyCapabilityCardProps {
  title: string;
  description: string;
}

export function EmptyCapabilityCard({ title, description }: EmptyCapabilityCardProps) {
  return (
    <section
      className="rounded-lg border border-border bg-muted/30 p-5"
      aria-label={`${title}（需要特定題型）`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}
