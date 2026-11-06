interface SectionHeadingProps {
  title: string;
  description: string;
}

export function SectionHeading({ title, description }: SectionHeadingProps) {
  return (
    <header className="border-t-2 border-ink pt-3">
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
    </header>
  );
}
