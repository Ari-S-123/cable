/** Provides a keyboard-visible shortcut past repeated navigation. */
export function SkipLink({
  label = "Skip to main content",
}: Readonly<{ label?: string | undefined }>) {
  return (
    <a
      href="#main-content"
      className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-xl transition-transform focus:translate-y-0"
    >
      {label}
    </a>
  );
}
