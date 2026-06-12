import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const themeInitScript = `
(() => {
  try {
    const key = "review-pilot-atlas-mode";
    const stored = window.localStorage.getItem(key);
    const mode = stored === "archive" || stored === "night" ? stored : "night";
    document.documentElement.dataset.atlasMode = mode;
    document.documentElement.classList.toggle("dark", mode === "night");
  } catch {
    document.documentElement.dataset.atlasMode = "night";
    document.documentElement.classList.add("dark");
  }
})();
`;

export const metadata: Metadata = {
  title: "Review Pilot",
  description: "Self-hosted Google review handling"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-atlas-mode="night" className={cn("dark font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Toaster position="top-center" closeButton />
      </body>
    </html>
  );
}
