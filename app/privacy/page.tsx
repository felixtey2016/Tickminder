import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { legalLanguage } from "@/lib/legal-content";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Privacy Policy · ${BRAND_NAME}`, description: `How ${BRAND_NAME} handles personal information.` };
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  return <LegalDocument document="privacy" language={legalLanguage(params.lang, true)}/>;
}
