import type { Metadata } from "next";
import "./globals.css";
import { DevicesProvider } from "@/contexts/DevicesContext";
import { LocationsProvider } from "@/contexts/LocationsContext";
import { DataCacheProvider } from "@/contexts/DataCacheContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "Counter Manager - CrowdCount",
  description: "Manage your CrowdCount devices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col font-sans">
        <ThemeProvider>
          <DevicesProvider>
            <LocationsProvider>
              <DataCacheProvider>
                <div className="flex-1">{children}</div>
                <footer className="border-t py-4 text-center text-sm text-muted-foreground">
                  © {new Date().getFullYear()} CrowdCount LLC. All rights reserved.
                  {" | "}
                  <a
                    href="https://crowdcount.tech/legal/privacy-policy.html"
                    className="text-secondary-foreground hover:underline"
                  >
                    Privacy Policy
                  </a>
                  {" | "}
                  <a
                    href="https://crowdcount.tech/legal/terms-of-use.html"
                    className="text-secondary-foreground hover:underline"
                  >
                    Terms of Use
                  </a>
                </footer>
              </DataCacheProvider>
            </LocationsProvider>
          </DevicesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
