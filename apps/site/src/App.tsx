import { useEffect, useMemo, useState } from "react";
import { CONTENT, type Lang } from "./i18n";
import { LangContext } from "./ctx";
import Hero from "./Hero";
import {
  CTA,
  Download,
  Features,
  MobileShowcase,
  Quickstart,
  Security,
  Why,
} from "./Sections";
import { IconGithub, IconStar } from "./icons";

const GH = "https://github.com/binjie09/ChatMux";

function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cffb2" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0e1612" stroke="#1d2b25" strokeWidth="2" />
      <line x1="32" y1="18" x2="32" y2="50" stroke="#1d2b25" strokeWidth="2" />
      <polyline points="9,28 14,32 9,36" fill="none" stroke="url(#lg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="17" y1="36" x2="25" y2="36" stroke="url(#lg)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="29" r="2.4" fill="url(#lg)" />
      <rect x="37" y="34" width="13" height="2.4" rx="1.2" fill="#7cffb2" opacity="0.45" />
      <rect x="37" y="39.5" width="9" height="2.4" rx="1.2" fill="#2dd4bf" opacity="0.35" />
      <rect x="37" y="45" width="11" height="2.4" rx="1.2" fill="#7cffb2" opacity="0.25" />
    </svg>
  );
}

function Nav({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const c = CONTENT[lang];
  return (
    <header className="nav">
      <div className="wrap nav__inner">
        <a className="brand" href="#top" aria-label="ChatMux">
          <Logo className="logo" />
          <span>
            <b>Chat</b>
            <span>Mux</span>
          </span>
        </a>
        <nav className="nav__links">
          <a href="#features">{c.nav.features}</a>
          <a href="#mobile">{c.nav.features === "Features" ? "Mobile" : "移动端"}</a>
          <a href="#security">{c.nav.security}</a>
          <a href="#selfhost">{c.nav.selfhost}</a>
          <a href="#download">{c.nav.download}</a>
        </nav>
        <div className="nav__spacer" />
        <div className="nav__actions">
          <button
            className="lang-toggle"
            type="button"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label="Switch language"
          >
            {lang === "zh" ? "EN" : "中"}
          </button>
          <a
            className="gh-btn"
            href={GH}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconGithub style={{ width: 16, height: 16 }} />
            <span className="label">{c.nav.github}</span>
            <IconStar className="star" style={{ width: 13, height: 13 }} />
          </a>
        </div>
      </div>
    </header>
  );
}

function Footer({ lang }: { lang: Lang }) {
  const c = CONTENT[lang];
  const f = c.footer;
  const productAnchors = ["features", "mobile", "security", "download"];
  return (
    <footer>
      <div className="wrap">
        <div className="footer__grid">
          <div className="footer__brand">
            <a className="brand" href="#top" aria-label="ChatMux">
              <Logo className="logo" />
              <span>
                <b>Chat</b>
                <span>Mux</span>
              </span>
            </a>
            <p className="tagline">{f.tagline}</p>
          </div>
          <div className="footer__col">
            <h5>{f.productTitle}</h5>
            {f.product.map((p, i) => (
              <a key={p} href={`#${productAnchors[i]}`}>
                {p}
              </a>
            ))}
          </div>
          <div className="footer__col">
            <h5>{f.resourcesTitle}</h5>
            {f.resources.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer noopener">
                {label}
              </a>
            ))}
          </div>
          <div className="footer__col">
            <h5>{f.communityTitle}</h5>
            {f.community.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer noopener">
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} ChatMux · {f.rights}</span>
          <span className="icp">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer noopener">
              {f.icp}
            </a>
          </span>
          <span>{f.built}</span>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("chatmux-site-lang");
      if (saved === "en" || saved === "zh") return saved;
    }
    return "zh";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("chatmux-site-lang", l);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    document.title =
      lang === "en"
        ? "ChatMux — Self-hosted SSH / tmux workspace"
        : "ChatMux — 自托管 SSH / tmux 工作空间";
  }, [lang]);

  // scroll-reveal: observe every `.reveal` once on mount.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (reduce) {
      targets.forEach((t) => t.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, c: CONTENT[lang] }),
    [lang],
  );

  return (
    <LangContext.Provider value={value}>
      <div className="bg-fx" />
      <div className="bg-grid" />
      <div className="bg-noise" />
      <Nav lang={lang} setLang={setLang} />
      <main>
        <Hero />
        <div className="marquee" aria-hidden="true">
          <div className="marquee__track">
            {[...CONTENT[lang].marquee, ...CONTENT[lang].marquee].map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        </div>
        <Why />
        <Features />
        <MobileShowcase />
        <Security />
        <Quickstart />
        <Download />
        <CTA />
      </main>
      <Footer lang={lang} />
    </LangContext.Provider>
  );
}
