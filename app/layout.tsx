import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DevicesProvider } from "@/contexts/DevicesContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CrowdCount Manager",
  description: "Manage your CrowdCount devices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <DevicesProvider>{children}</DevicesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
