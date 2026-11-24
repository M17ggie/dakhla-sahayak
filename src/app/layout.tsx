import type { Metadata, Viewport } from "next";
import { Mukta } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { resolveLocale } from "@/i18n/request";
import "./globals.css";

/** A Devanagari face designed for screens, with a matching Latin. */
const mukta = Mukta({
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mukta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: `${t("name")} — ${t("subtitle")}`,
    description: t("office"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f5f0",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveLocale();
  const messages = await getMessages();
  const t = await getTranslations("common");

  return (
    <html lang={locale} className={mukta.variable}>
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="no-print sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-[var(--color-brand)] focus:px-4 focus:py-2 focus:text-white"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
