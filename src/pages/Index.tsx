import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Layers, Download, Zap, Shield, Clock, ChevronRight, Sparkles } from "lucide-react";
import trabalhoExemplo from "@/assets/trabalho-exemplo.jpg";

const Index = () => {
  useEffect(() => {
    document.title = "LJsmart-Academic | Trabalhos Académicos em Minutos";

    const description = "Receba seu trabalho académico completo em minutos. Word pronto para entregar.";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, []);

  const testimonials = [
    { text: "Gerei o trabalho em poucos minutos e já veio todo organizado. Só precisei adaptar ao meu estilo.", author: "Estudante universitário" },
    { text: "Uso para criar a estrutura dos meus relatórios de pesquisa. Fica tudo muito mais rápido.", author: "Aluna de mestrado" },
    { text: "O trabalho saiu com introdução, desenvolvimento e conclusão direitinhos.", author: "Estudante de licenciatura" },
    { text: "Tenho aulas e estágio, quase não tenho tempo. A ferramenta monta o texto base.", author: "Universitária" },
  ];

  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] text-sm font-bold text-white shadow-lg shadow-[hsl(263,70%,58%)/0.3]">
              LJ
            </div>
            <span className="font-display text-lg font-bold tracking-tight">LJsmart</span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              to="/criar-trabalho"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[hsl(263,70%,58%)/0.25] transition-all duration-200 hover:shadow-xl hover:shadow-[hsl(263,70%,58%)/0.35] hover:-translate-y-0.5"
            >
              Começar Agora
              <ChevronRight size={16} />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative flex min-h-[85vh] items-center justify-center px-5 py-20">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,hsl(263,70%,58%,0.15),transparent_70%)]" />
          <div className="absolute bottom-0 left-1/4 h-[400px] w-[600px] rounded-full bg-[radial-gradient(ellipse,hsl(239,84%,67%,0.1),transparent_70%)]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="animate-fade-up mb-8 inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles size={14} className="text-[hsl(263,70%,58%)]" />
            Mais de 1.000 trabalhos gerados
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up-delay-1 font-display text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Receba seu trabalho académico completo{" "}
            <span className="bg-gradient-to-r from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] bg-clip-text text-transparent">
              em minutos
            </span>
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-up-delay-2 mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Preencha o tema, escolha o nível e receba um PDF estruturado com introdução, desenvolvimento, conclusão e referências — pronto para entregar.
          </p>

          {/* CTA */}
          <div className="animate-fade-up-delay-3 mt-10 flex flex-col items-center gap-4">
            <Link
              to="/criar-trabalho"
              className="cta-glow inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[hsl(142,71%,45%)] to-[hsl(160,84%,39%)] px-8 py-4 text-base font-bold text-white shadow-2xl transition-all duration-200 hover:scale-[1.03] hover:-translate-y-0.5 sm:text-lg"
            >
              <Zap size={20} />
              Gerar meu trabalho agora
            </Link>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Shield size={14} />
              Sem cadastro. Rápido e seguro.
            </p>
          </div>

          {/* Document preview mock */}
          <div className="animate-fade-up-delay-4 mx-auto mt-16 max-w-lg">
            <div className="glass-card animate-float rounded-2xl p-6 shadow-2xl shadow-black/30">
              <div className="flex items-center gap-3 border-b border-border/30 pb-4">
                <FileText size={20} className="text-[hsl(263,70%,58%)]" />
                <span className="font-display text-sm font-semibold">Trabalho_Academico.docx</span>
                <span className="ml-auto rounded-full bg-[hsl(142,71%,45%)/0.15] px-2.5 py-0.5 text-xs font-medium text-[hsl(142,71%,45%)]">
                  Pronto
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-lg">
                <img
                  src={trabalhoExemplo}
                  alt="Exemplo de trabalho académico gerado"
                  className="w-full rounded-lg object-cover"
                  width={640}
                  height={800}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-border/30 bg-secondary/30 py-12">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-5 sm:grid-cols-4">
          {[
            { value: "1.000+", label: "Trabalhos gerados" },
            { value: "< 2 min", label: "Tempo médio" },
            { value: "PDF", label: "Pronto para entregar" },
            { value: "100%", label: "Estruturado" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-2xl font-extrabold bg-gradient-to-r from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] bg-clip-text text-transparent sm:text-3xl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it Works ── */}
      <section className="px-5 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Como funciona?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
              Em 3 passos simples, o seu trabalho está pronto.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: <FileText size={28} />,
                step: "01",
                title: "Digite o tema",
                desc: "Escreva o tema do trabalho e qualquer detalhe adicional que queira incluir.",
              },
              {
                icon: <Layers size={28} />,
                step: "02",
                title: "Escolha o nível",
                desc: "Selecione o nível académico: licenciatura, mestrado ou outro formato desejado.",
              },
              {
                icon: <Download size={28} />,
                step: "03",
                title: "Baixe seu trabalho",
                desc: "Receba o trabalho completo em PDF ou Word, pronto para revisar e entregar.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group glass-card rounded-2xl p-7 transition-all duration-300 hover:border-[hsl(263,70%,58%)/0.4] hover:-translate-y-1"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] text-white shadow-lg shadow-[hsl(263,70%,58%)/0.2] transition-transform duration-300 group-hover:scale-110">
                  {item.icon}
                </div>
                <p className="mt-5 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Passo {item.step}
                </p>
                <h3 className="mt-2 font-display text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="border-t border-border/30 bg-secondary/20 px-5 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            O que dizem os estudantes
          </h2>

          <div className="relative mt-12 min-h-[140px]">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${
                  i === currentTestimonial ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <p className="max-w-lg text-base leading-relaxed text-foreground/90 sm:text-lg">
                  "{t.text}"
                </p>
                <p className="mt-4 text-sm font-medium text-muted-foreground">— {t.author}</p>
              </div>
            ))}
          </div>

          {/* Dots */}
          <div className="mt-6 flex justify-center gap-2">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentTestimonial(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentTestimonial ? "w-6 bg-[hsl(263,70%,58%)]" : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-5 py-24">
        <div className="mx-auto max-w-2xl rounded-3xl bg-gradient-to-br from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] p-10 text-center shadow-2xl shadow-[hsl(263,70%,58%)/0.25] sm:p-16">
          <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
            Pronto para criar seu trabalho?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-white/80 sm:text-base">
            Sem complicações. Preencha o formulário e receba seu trabalho académico completo em minutos.
          </p>
          <Link
            to="/criar-trabalho"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-[hsl(263,70%,40%)] shadow-lg transition-all duration-200 hover:scale-[1.03] hover:-translate-y-0.5 sm:text-lg"
          >
            <Zap size={20} />
            Gerar meu trabalho agora
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/30 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(263,70%,58%)] to-[hsl(239,84%,67%)] text-xs font-bold text-white">
              LJ
            </div>
            <span className="font-display text-sm font-semibold">LJsmart-Academic</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} LJsmart-Academic. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
