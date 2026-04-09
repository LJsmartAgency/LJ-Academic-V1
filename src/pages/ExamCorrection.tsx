import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { Camera, Loader2, Download, Upload, ArrowLeft, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Document, Packer, Paragraph, TextRun } from "docx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null);
    return payload?.error || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

const ExamCorrection = () => {
  const { toast } = useToast();
  const [course, setCourse] = useState("");
  const [educationLevel, setEducationLevel] = useState("Licenciatura");
  const [examTitle, setExamTitle] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [correction, setCorrection] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Guião de Correção | LJsmart-Academic";
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Ficheiro inválido", description: "Selecione uma imagem (JPG, PNG, WEBP).", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Ficheiro muito grande", description: "A imagem deve ter menos de 10MB.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!imageFile) {
      toast({ title: "Imagem obrigatória", description: "Envie a foto do exame.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setCorrection(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(imageFile);
      const imageBase64 = await base64Promise;

      const { data, error } = await supabase.functions.invoke("generate-correction", {
        body: {
          imageBase64,
          mimeType: imageFile.type,
          course,
          educationLevel,
          examTitle,
        },
      });

      if (error || !data?.correction) {
        toast({
          title: "Erro",
          description: await getFunctionErrorMessage(error, "Não foi possível gerar o guião. Tente novamente."),
          variant: "destructive",
        });
      } else {
        setCorrection(data.correction);
      }
    } catch {
      toast({ title: "Erro", description: "Falha ao contactar o servidor.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!correction) return;

    const paragraphs: Paragraph[] = [];
    const lines = correction.split("\n");

    for (const line of lines) {
      if (line.startsWith("# ")) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line.slice(2), bold: true, size: 32, font: "Arial" })], spacing: { before: 240, after: 120 } }));
      } else if (line.startsWith("## ")) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line.slice(3), bold: true, size: 28, font: "Arial" })], spacing: { before: 200, after: 100 } }));
      } else if (line.startsWith("**") && line.endsWith("**")) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line.replace(/\*\*/g, ""), bold: true, font: "Arial" })], spacing: { before: 120, after: 60 } }));
      } else if (line.startsWith("---")) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 120, after: 120 } }));
      } else if (line.trim()) {
        const runs: TextRun[] = [];
        let lastIdx = 0;
        const regex = /\*\*([^*]+)\*\*/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
          if (match.index > lastIdx) runs.push(new TextRun({ text: line.slice(lastIdx, match.index), font: "Arial" }));
          runs.push(new TextRun({ text: match[1], bold: true, font: "Arial" }));
          lastIdx = regex.lastIndex;
        }
        if (lastIdx < line.length) runs.push(new TextRun({ text: line.slice(lastIdx), font: "Arial" }));
        if (runs.length === 0) runs.push(new TextRun({ text: line, font: "Arial" }));
        paragraphs.push(new Paragraph({ children: runs, spacing: { after: 60 } }));
      }
    }

    const doc = new Document({
      sections: [{ children: paragraphs }],
    });

    const buffer = await Packer.toBlob(doc);
    const url = URL.createObjectURL(buffer);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Guiao_Correcao${examTitle ? `_${examTitle.replace(/\s+/g, "_")}` : ""}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] text-sm font-bold text-white shadow-lg shadow-[hsl(263,70%,58%)/0.3]">
              LJ
            </div>
            <span className="font-display text-lg font-bold tracking-tight">LJsmart</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/criar-trabalho" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Criar Trabalho
            </Link>
            <Link
              to="/guiao-correcao"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
            >
              Guião de Correção
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} /> Voltar
        </Link>

        {!correction ? (
          <div className="space-y-8">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight">
                Guião de Correção
              </h1>
              <p className="mt-2 text-muted-foreground">
                Envie a foto do exame e a IA irá resolver todas as questões com explicação detalhada.
              </p>
            </div>

            <div className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              {/* Course */}
              <div className="space-y-2">
                <Label>Curso / Disciplina</Label>
                <Input
                  placeholder="Ex: Contabilidade, Direito, Economia..."
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                />
              </div>

              {/* Education Level */}
              <div className="space-y-2">
                <Label>Nível de Ensino</Label>
                <Select value={educationLevel} onValueChange={setEducationLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ensino secundário">Ensino Secundário</SelectItem>
                    <SelectItem value="Ensino técnico profissional">Ensino Técnico Profissional</SelectItem>
                    <SelectItem value="Licenciatura">Licenciatura</SelectItem>
                    <SelectItem value="Mestrado">Mestrado</SelectItem>
                    <SelectItem value="Doutoramento">Doutoramento</SelectItem>
                    <SelectItem value="Curso profissional">Curso Profissional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Exam Title */}
              <div className="space-y-2">
                <Label>Título do Exame (opcional)</Label>
                <Input
                  placeholder="Ex: Exame Final de Contabilidade Geral"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                />
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <Label>Foto do Exame / Avaliação</Label>
                <div
                  className="relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/60 bg-secondary/30 p-6 transition-colors hover:border-[hsl(263,70%,58%)/0.5] hover:bg-secondary/50"
                  onClick={() => document.getElementById("exam-image-input")?.click()}
                >
                  {imagePreview ? (
                    <div className="relative w-full">
                      <img src={imagePreview} alt="Pré-visualização do exame" className="mx-auto max-h-[300px] rounded-lg object-contain" />
                      <div className="mt-3 text-center text-xs text-muted-foreground">
                        Clique para trocar a imagem
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] text-white">
                        <Camera size={28} />
                      </div>
                      <p className="text-sm font-medium">Clique para enviar a foto do exame</p>
                      <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP (máx. 10MB)</p>
                    </>
                  )}
                  <input
                    id="exam-image-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !imageFile}
                className="w-full rounded-xl bg-gradient-to-r from-[hsl(142,71%,45%)] to-[hsl(160,84%,39%)] py-6 text-base font-bold text-white shadow-lg hover:shadow-xl transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    A analisar o exame...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-5 w-5" />
                    Gerar Guião de Correção
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-[hsl(142,71%,45%)]" />
                <h1 className="font-display text-2xl font-bold">Guião Gerado</h1>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setCorrection(null); setImageFile(null); setImagePreview(null); }}>
                  Novo Guião
                </Button>
                <Button onClick={handleDownloadDocx} className="bg-gradient-to-r from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] text-white">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Word
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{correction}</ReactMarkdown>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ExamCorrection;
