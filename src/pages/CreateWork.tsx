import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { workFormSchema, type WorkFormValues, generateAcademicWork, type AcademicWork } from "@/lib/generator";
import { invokeFunction } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker as string;



const CreateWork = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  useEffect(() => {
    document.title = "Criar trabalho | LJsmart-Academic";

    const description =
      "Preencha o formulário inteligente da LJsmart-Academic para gerar um trabalho académico estruturado.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href;
  }, []);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => ("str" in item ? item.str : ""));
      fullText += strings.join(" ") + "\n\n";
      if (fullText.length > 16000) break;
    }

    return fullText.trim();
  };

  const form = useForm<WorkFormValues>({
    resolver: zodResolver(workFormSchema),
    defaultValues: {
      educationLevel: "Ensino secundário",
      workType: "Artigo científico",
      area: "",
      theme: "",
      description: "",
      pages: "10",
      languagePtBr: true,
      languageEn: false,
      style: "ABNT",
      tone: "Formal académico",
    },
  });

  const handleGenerateDescription = async () => {
    const theme = form.getValues("theme");
    if (!theme || theme.length < 3) {
      toast({ title: "Informe o tema primeiro", description: "Escreva o tema do trabalho antes de gerar a descrição.", variant: "destructive" });
      return;
    }
    setIsGeneratingDesc(true);
    try {
      const { data, error } = await invokeFunction("generate-description", {
        theme,
        area: form.getValues("area"),
        educationLevel: form.getValues("educationLevel"),
      });
      if (error || !data?.description) {
        toast({
          title: "Erro",
          description: error || "Não foi possível gerar a descrição. Tente novamente.",
          variant: "destructive",
        });
      } else {
        form.setValue("description", data.description, { shouldValidate: true });
      }
    } catch {
      toast({ title: "Erro", description: "Falha ao contactar o servidor.", variant: "destructive" });
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const onSubmit = async (values: WorkFormValues) => {
    try {
      let pdfText: string | undefined;

      if (pdfFile) {
        try {
          pdfText = await extractTextFromPdf(pdfFile);
        } catch (error) {
          console.error("Erro ao extrair texto do PDF", error);
        }
      }

      const { data, error } = await invokeFunction("generate-work", {
        ...values, pdfName: pdfFile ? pdfFile.name : undefined, pdfText,
      });

      let work: AcademicWork;

      if (error || !data || !(data as { work?: AcademicWork }).work) {
        console.error("Erro na função generate-work", error);
        toast({
          title: "IA indisponível",
          description: error || "A IA não respondeu, por isso foi usada a geração local.",
          variant: "destructive",
        });
        work = generateAcademicWork(values);
      } else {
        work = (data as { work: AcademicWork }).work;
      }

      navigate("/resultado", { state: { work, form: values } });
    } catch (err) {
      console.error("Erro ao chamar generate-work", err);
      const work = generateAcademicWork(values);
      navigate("/resultado", { state: { work, form: values } });
    }
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <span className="text-lg font-bold">LJ</span>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">LJsmart-Academic</p>
              <p className="text-xs text-muted-foreground">Pesquisa inteligente em poucos cliques</p>
            </div>
          </button>
        </div>
      </header>
      <div className="container py-8">
        <header className="mb-8 flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Criar trabalho de pesquisa</h1>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card/70 p-6 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="educationLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nível de ensino</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Ensino básico">Ensino básico</SelectItem>
                          <SelectItem value="Ensino secundário">Ensino secundário</SelectItem>
                          <SelectItem value="Ensino técnico">Ensino técnico</SelectItem>
                          <SelectItem value="Licenciatura">Licenciatura</SelectItem>
                          <SelectItem value="Mestrado">Mestrado</SelectItem>
                          <SelectItem value="Doutoramento">Doutoramento</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="workType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de trabalho</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Artigo científico">Artigo científico</SelectItem>
                          <SelectItem value="Trabalho escrito">Trabalho escrito</SelectItem>
                          <SelectItem value="Relatório">Relatório</SelectItem>
                          <SelectItem value="Projeto de pesquisa">Projeto de investigação</SelectItem>
                          <SelectItem value="TCC">TCC</SelectItem>
                          <SelectItem value="Monografia">Monografia</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Área / disciplina</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: História, Matemática, Ciências, Economia" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tema do trabalho</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex.: Impacto da Tecnologia na Educação"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição detalhada (opcional)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={4}
                          placeholder="Ex: O trabalho deve abordar temas como: impacto da tecnologia na educação moderna, impacto da tecnologia na educação tradicional, etc."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateDescription}
                    disabled={isGeneratingDesc}
                    className="gap-2"
                  >
                    {isGeneratingDesc ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isGeneratingDesc ? "A gerar..." : "Melhorar Descrição"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="pages"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número aproximado de páginas</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={120} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <p className="text-sm font-medium">Idiomas do texto</p>
                  <div className="space-y-2 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-sm">
                    <FormField
                      control={form.control}
                      name="languagePtBr"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                              id="lang-pt"
                            />
                          </FormControl>
                          <label htmlFor="lang-pt" className="select-none text-sm hover:cursor-pointer">
                            Português (Portugal)
                          </label>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="languageEn"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                              id="lang-en"
                            />
                          </FormControl>
                          <label htmlFor="lang-en" className="select-none text-sm hover:cursor-pointer">
                            Inglês
                          </label>
                        </FormItem>
                      )}
                    />
                    <FormMessage />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="style"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Norma / estilo (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um estilo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ABNT">ABNT (básico)</SelectItem>
                          <SelectItem value="APA">APA (básico)</SelectItem>
                          <SelectItem value="Vancouver">Vancouver (básico)</SelectItem>
                          <SelectItem value="Nenhum">Sem formatação específica</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tom de escrita (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tom" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Formal académico">Formal académico</SelectItem>
                          <SelectItem value="Muito formal">Muito formal</SelectItem>
                          <SelectItem value="Simples e directo">Simples e directo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2 border-t border-border/60 pt-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">PDF base do trabalho (opcional)</p>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setPdfFile(file);
                    }}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => form.reset()}>
                    Limpar formulário
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "A processar..." : "Gerar trabalho"}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </section>
      </div>
    </div>
  );
};

export default CreateWork;
