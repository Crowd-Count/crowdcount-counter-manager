"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          height: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h2>
          <p
            style={{
              color: "#a1a1aa",
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
            }}
          >
            This may be caused by a poor network connection. Please check your
            connection and try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #27272a",
              background: "#18181b",
              color: "#fafafa",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
