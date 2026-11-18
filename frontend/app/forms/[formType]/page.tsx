import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import DocumentScanner from "@/components/DocumentScanner";
import { parseFormLayout } from "@/lib/formLayouts";

type Props = { params: { formType: string } };

export default async function FormPage({ params }: Props) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(params.formType)) notFound();

  const layoutPath = path.join(process.cwd(), "forms", `${params.formType}.json`);
  let contents: string;
  try {
    contents = await readFile(layoutPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") notFound();
    throw error;
  }

  const layout = parseFormLayout(JSON.parse(contents) as unknown);
  if (layout.id !== params.formType) notFound();
  return <DocumentScanner layout={layout} />;
}
