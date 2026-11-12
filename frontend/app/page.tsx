import DocumentScanner from "@/components/DocumentScanner";
import letterLayout from "@/forms/letter.json";
import { parseFormLayout } from "@/lib/formLayouts";

export default function HomePage() {
  return <DocumentScanner layout={parseFormLayout(letterLayout)} />;
}
