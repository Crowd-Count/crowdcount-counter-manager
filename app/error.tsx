"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center px-4">
        <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This may be caused by a poor network connection. Please check your
          connection and try again.
        </p>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </div>
  );
}
