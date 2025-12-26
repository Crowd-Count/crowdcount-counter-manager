import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DevicesProvider } from "@/contexts/DevicesContext";

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
    <html lang="en">
      <body className={inter.className}>
        <DevicesProvider>{children}</DevicesProvider>
      </body>
    </html>
  );
}
