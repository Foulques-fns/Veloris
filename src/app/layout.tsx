"use client";

import { I18nProvider } from "@/context/I18nContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import "./globals.css";

const themeInit = `(function(){try{var t=localStorage.getItem('nova-theme')||'dark';document.documentElement.classList.toggle('light',t==='light');}catch(e){document.documentElement.classList.remove('light');}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <I18nProvider>
          <ThemeProvider>
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: '100%', width: '100%' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
