// Update this page (the content is just a fallback if you fail to update the page)

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const Index = () => {
  useEffect(() => {
    document.title = "LJsmart-Academic | Gerador de Trabalhos";

    const description = "Gere trabalhos acadêmicos estruturados a partir de um formulário simples com a LJsmart-Academic.";
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

  const testimonials = [
    "\"Gerei o trabalho em poucos minutos e já veio todo organizado por partes. Só precisei adaptar ao meu estilo.\" — Estudante universitário",
    "\"Uso para criar a estrutura dos meus relatórios de pesquisa. Fica tudo muito mais rápido e claro.\" — Aluna de mestrado",
    "\"O trabalho saiu com introdução, desenvolvimento e conclusão direitinhos, em formato académico.\" — Estudante de licenciatura",
    "\"Tenho aulas e estágio, quase não tenho tempo. A ferramenta monta o texto base e eu foco em aprofundar.\" — Universitária",
    "\"Já usei para vários trabalhos de faculdade. Sempre vem bem estruturado e fácil de ajustar.\" — Finalista de curso",
    "\"Ajuda muito a começar trabalhos grandes, com uma estrutura lógica que os professores exigem.\" — Estudante de engenharia",
    "\"Gerou um resumo super organizado do artigo que o professor pediu, poupei horas de leitura.\" — Estudante de ciências sociais",
    "\"Perfeito para quem precisa entregar pesquisas rápidas mas com ar profissional e académico.\" — Universitário trabalhador",
  ];

  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonialIndex((prev) => {
        let next = Math.floor(Math.random() * testimonials.length);
        if (next === prev) {
          next = (prev + 1) % testimonials.length;
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [testimonials.length]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/95 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <span className="text-lg font-bold">LJ</span>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">LJsmart-Academic</p>
              <p className="text-xs text-muted-foreground">Pesquisa inteligente em poucos cliques</p>
            </div>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <button type="button" className="hidden rounded-full px-4 py-1.5 text-xs font-medium hover:text-foreground md:inline-flex">
              Assistir ao vídeo
            </button>
            <button type="button" className="hidden rounded-full px-4 py-1.5 text-xs font-medium hover:text-foreground md:inline-flex">
              Entrar
            </button>
            <Link
              to="/criar-trabalho"
              className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Começar Agora
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative flex min-h-[80vh] items-center justify-center overflow-hidden bg-gradient-to-b from-[hsl(var(--hero-top))] via-[hsl(var(--background))] to-[hsl(var(--background))] px-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.22),_transparent_60%),_radial-gradient(circle_at_bottom,_hsl(var(--primary)/0.16),_transparent_55%)]" />
        <div className="container relative z-10 flex flex-col items-center gap-10 py-20 text-center">
          <section className="max-w-2xl space-y-6">
            <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              Trabalhos estruturados prontos a usar — rápido, confiável e sem complicações.
            </span>
            <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
              Estuda de forma inteligente com trabalhos académicos completos em segundos.
            </h1>
            <h2 className="font-display text-lg font-semibold text-foreground md:text-xl">
              Deixa a parte difícil connosco. Tu focas no que importa: aprender.
            </h2>
            <h3 className="text-base font-medium text-muted-foreground md:text-lg">
              A LJsmart-Academic cria trabalhos e resumos académicos completos, estruturados com introdução, desenvolvimento, conclusão e
              referências, prontos para download em PDF ou Word.
            </h3>
            <p className="text-sm font-medium text-muted-foreground md:text-base">Poupa tempo. Estuda melhor. Sem stress.</p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/criar-trabalho"
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Criar meu trabalho agora
              </Link>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Sem registo obrigatório. Apenas preenche o tema e recebe teu trabalho completo.
              </p>
            </div>
          </section>

          <aside className="mt-10 w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-4 text-left shadow-lg shadow-black/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clientes satisfeitos</p>
            <p className="mt-2 text-sm text-foreground md:text-base">
              {testimonials[currentTestimonialIndex]}
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Index;
