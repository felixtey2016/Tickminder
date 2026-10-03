import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { legalLanguage } from "@/lib/legal-content";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Terms and Conditions · ${BRAND_NAME}`, description: `Terms for using ${BRAND_NAME}.` };
export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  return <LegalDocument document="terms" language={legalLanguage(params.lang)}/>;
}
