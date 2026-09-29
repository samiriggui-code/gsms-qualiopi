import { ReactNode, Suspense } from 'react';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/components/query-provider';

import '@/styles/globals.css';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | GSMS Qualiopi',
    default: 'GSMS Qualiopi',
  },
  icons: {
    icon: '/media/app/formssi-icon.png',
    apple: '/media/app/formssi-icon.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="fr" className="h-full" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={cn(
          'antialiased flex h-full text-base text-foreground bg-background',
          inter.className,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          storageKey="nextjs-theme"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <TooltipProvider delayDuration={0}>
            <QueryProvider>
              <Suspense>{children}</Suspense>
            </QueryProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
