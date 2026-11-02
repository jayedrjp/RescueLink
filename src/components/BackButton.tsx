import { ChevronLeft } from "lucide-react";
import { useBackNavigation, type BackTarget } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Back arrow that behaves like a real back button (see useBackNavigation).
 * `fallback` is only used when there is no history to go back to.
 */
export function BackButton({
  fallback = "/",
  label = "Go back",
  className,
  onBack,
}: {
  fallback?: BackTarget;
  label?: string;
  className?: string;
  /** Replace the default history-back (e.g. admin tabs return to the dashboard tab). */
  onBack?: () => void;
}) {
  const { goBack } = useBackNavigation(fallback);
  return (
    <button
      type="button"
      onClick={onBack ?? goBack}
      aria-label={label}
      className={cn(
        "press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-foreground",
        className,
      )}
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}
