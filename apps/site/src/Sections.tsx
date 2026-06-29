import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useC } from "./ctx";
import {
  IconAlert,
  IconAndroid,
  IconApple,
  IconArrow,
  IconCheck,
  IconCopy,
  IconGithub,
  IconGlobe,
  IconGrid,
  IconHistory,
  IconLayers,
  IconLinux,
  IconPhone,
  IconServer,
  IconShield,
  IconSpark,
  IconTerminal,
  IconWindows,
} from "./icons";
import { applyPhoneFocus } from "./mobileShowcaseFocus";

/* ---------------- Why ---------------- */
export function Why() {
  const c = useC();
  return (
    <section id="why">
      <div className="wrap">
        <div className="reveal">
          <span className="section-label">{c.why.label}</span>
          <h2 className="section-title">{c.why.title}</h2>
          <p className="lead">{c.why.lead}</p>
        </div>
        <div className="why__grid">
          {c.why.pillars.map((p, i) => (
            <div
              key={p.n}
              className="why__cell reveal"
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <div className="why__n">{p.n}</div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Features ---------------- */
const FEATURE_ICONS = [
  IconTerminal,
  IconLayers,
  IconHistory,
  IconServer,
  IconPhone,
  IconSpark,
  IconShield,
  IconGrid,
];
const WIDE = new Set([0, 1, 6, 7]);

function tagClass(tag: string) {
  if (tag === "OPT") return "opt";
  if (tag === "SEC") return "sec";
  if (tag === "ALL") return "all";
  return "";
}

export function Features() {
  const c = useC();
  return (
    <section id="features">
      <div className="wrap">
        <div className="features__head reveal">
          <div>
            <span className="section-label">{c.features.label}</span>
            <h2 className="section-title">{c.features.title}</h2>
          </div>
          <p className="lead" style={{ margin: 0 }}>
            {c.features.lead}
          </p>
        </div>
        <div className="bento">
          {c.features.items.map((f, i) => {
            const Ico = FEATURE_ICONS[i] ?? IconTerminal;
            return (
              <div
                key={f.title}
                className={`card reveal ${WIDE.has(i) ? "wide" : ""}`}
                style={{ transitionDelay: `${(i % 4) * 70}ms` }}
              >
                <div className="ico">
                  <Ico />
                </div>
                <span className={`tag ${tagClass(f.tag)}`}>{f.tag}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Mobile showcase ---------------- */
const PHONE_SHOTS = [
  "chatmux-mobile-terminal.png",
  "chatmux-mobile-files.png",
  "chatmux-mobile-sessions.jpg",
  "chatmux-mobile-windows.jpg",
  "chatmux-mobile-hosts.jpg",
];
const SHOWCASE_SCROLL_SPEED_MULTIPLIER = 5;
const SHOWCASE_STAGE_BASE_VH = 100;
const SHOWCASE_PAN_ENTRY = 0.12;
const SHOWCASE_PAN_EXIT = 0.9;

export function MobileShowcase() {
  const c = useC();
  const captions = c.mobile.captions;
  const N = PHONE_SHOTS.length;

  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // rangeRef holds the latest measured translate range so the scroll handler
  // (bound once) always reads current values without re-subscribing.
  const rangeRef = useRef({ start: 0, end: 0 });
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [active, setActive] = useState(0);
  // The immersive pinned gallery only runs on fine-pointer (mouse) wide
  // screens. Touch devices get a native swipe carousel instead.
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 821px) and (pointer: fine)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setEnabled(mq.matches && !rm.matches);
    apply();
    const onChange = () => apply();
    mq.addEventListener("change", onChange);
    rm.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      rm.removeEventListener("change", onChange);
    };
  }, []);

  // Measure the horizontal translate range that centres the first and last phone.
  useLayoutEffect(() => {
    if (!enabled) return;
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const phones = track.querySelectorAll<HTMLElement>(".mx-phone");
      const first = phones[0];
      const last = phones[phones.length - 1];
      if (!first || !last) return;
      const vw = window.innerWidth;
      const start = vw / 2 - (first.offsetLeft + first.offsetWidth / 2);
      const end = vw / 2 - (last.offsetLeft + last.offsetWidth / 2);
      rangeRef.current = { start, end };
      setRange({ start, end });
    };
    measure();
    // Re-measure shortly after, once the (lazy-ish) images have a layout.
    const t = window.setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [enabled]);

  // Drive the transform from scroll progress. Imperative (no per-frame React
  // state) for smoothness; the page's native vertical scroll is the source of
  // truth — no wheel hijacking, so trackpads and smooth-scroll stay native.
  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;
    const phones = Array.from(track.querySelectorAll<HTMLElement>(".mx-phone"));
    let raf = 0;
    const update = () => {
      const vh = window.innerHeight;
      const total = stage.offsetHeight - vh;
      const top = stage.getBoundingClientRect().top;
      const p = total > 0 ? Math.min(Math.max(-top, 0), total) / total : 0;
      const { start, end } = rangeRef.current;
      let tx = start;
      let scale = 1;
      let op = 1;
      let panT = 0;
      if (p < SHOWCASE_PAN_ENTRY) {
        // zoom-in: the first phone grows into the viewport
        const t = p / SHOWCASE_PAN_ENTRY;
        scale = 0.6 + 0.4 * t;
        op = 0.35 + 0.65 * t;
        tx = start;
        panT = 0;
      } else if (p > SHOWCASE_PAN_EXIT) {
        const t = (p - SHOWCASE_PAN_EXIT) / (1 - SHOWCASE_PAN_EXIT);
        scale = 1 - 0.05 * t;
        tx = end;
        panT = 1;
      } else {
        const t =
          (p - SHOWCASE_PAN_ENTRY) /
          (SHOWCASE_PAN_EXIT - SHOWCASE_PAN_ENTRY);
        tx = start + (end - start) * t;
        panT = t;
      }
      applyPhoneFocus(phones, panT);
      track.style.transform = `translate3d(${tx}px, -50%, 0) scale(${scale})`;
      track.style.opacity = op.toFixed(3);
      const ai = Math.round(panT * (N - 1));
      setActive((prev) => (prev !== ai ? ai : prev));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [enabled, range, N]);

  const scrollToPhone = (i: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const vh = window.innerHeight;
    const total = stage.offsetHeight - vh;
    const panT = N > 1 ? i / (N - 1) : 0;
    const p =
      SHOWCASE_PAN_ENTRY +
      panT * (SHOWCASE_PAN_EXIT - SHOWCASE_PAN_ENTRY);
    const top = stage.getBoundingClientRect().top + window.scrollY + p * total;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const heading = (
    <div className="wrap">
      <div className="reveal">
        <span className="section-label">{c.mobile.label}</span>
        <h2 className="section-title">{c.mobile.title}</h2>
        <p className="lead">{c.mobile.lead}</p>
      </div>
    </div>
  );

  if (!enabled) {
    // Touch / reduced-motion: native horizontal swipe carousel, large phones.
    return (
      <section id="mobile">
        {heading}
        <div className="mx-carousel" aria-label="ChatMux mobile screenshots">
          {PHONE_SHOTS.map((src, i) => (
            <figure className="mx-phone is-active" key={src}>
              <div className="mx-phone__screen">
                <img
                  src={`./shots/${src}`}
                  alt={`ChatMux ${captions[i]}`}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className="mx-phone__cap">{captions[i]}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="mobile">
      {heading}
      <div
        className="mx-stage"
        ref={stageRef}
        style={{
          height: `${
            SHOWCASE_STAGE_BASE_VH +
            (N * SHOWCASE_STAGE_BASE_VH) / SHOWCASE_SCROLL_SPEED_MULTIPLIER
          }vh`,
        }}
      >
        <div className="mx-panel">
          <div className="mx-frame">
            <div className="mx-track" ref={trackRef}>
              {PHONE_SHOTS.map((src, i) => (
                <figure
                  className={`mx-phone ${i === active ? "is-active" : ""}`}
                  key={src}
                >
                  <div className="mx-phone__screen">
                    <img
                      src={`./shots/${src}`}
                      alt={`ChatMux ${captions[i]}`}
                      decoding="async"
                    />
                  </div>
                  <figcaption className="mx-phone__cap">{captions[i]}</figcaption>
                </figure>
              ))}
            </div>
            <div className="mx-dots" role="tablist" aria-label="screenshots">
              {PHONE_SHOTS.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  className={`mx-dot ${i === active ? "is-on" : ""}`}
                  role="tab"
                  aria-selected={i === active}
                  aria-label={captions[i]}
                  onClick={() => scrollToPhone(i)}
                />
              ))}
            </div>
            <div className="mx-hint" aria-hidden="true">
              scroll to browse ⟶
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Security ---------------- */
export function Security() {
  const c = useC();
  const s = c.security;
  return (
    <section id="security">
      <div className="wrap">
        <div className="reveal">
          <span className="section-label">{s.label}</span>
          <h2 className="section-title">{s.title}</h2>
          <p className="lead">{s.lead}</p>
        </div>
        <div className="sec__grid">
          <div className="sec__diagram reveal">
            <div className="row">
              <div className="node">
                Web
                <small>browser SPA</small>
              </div>
              <div className="node">
                Desktop
                <small>Tauri · local GW</small>
              </div>
            </div>
            <div className="node" style={{ marginTop: 12 }}>
              Mobile
              <small>Capacitor · secure store</small>
            </div>
            <div className="wire">↕ HTTPS · Bearer Token</div>
            <div className="node gw">{s.boundary}</div>
            <div className="wire">↕ SSH · tmux · PTY</div>
            <div className="row">
              <div className="node">
                prod-01
                <small>your server</small>
              </div>
              <div className="node">
                build-fleet
                <small>your server</small>
              </div>
            </div>
          </div>
          <div className="reveal" style={{ transitionDelay: "100ms" }}>
            <ol className="sec__points">
              {s.points.map((p, i) => (
                <li key={i}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            <div className="sec__note">
              <IconAlert className="ic" style={{ width: 18, height: 18, flex: "none" }} />
              <span>{s.note}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Quickstart ---------------- */
function splitCmd(code: string) {
  const idx = code.indexOf(" #");
  if (idx === -1) return { cmd: code, comment: "" };
  return { cmd: code.slice(0, idx), comment: code.slice(idx) };
}

function CmdLine({
  num,
  code,
  copyLabel,
  copiedLabel,
}: {
  num: number;
  code: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const { cmd, comment } = splitCmd(code);
  return (
    <div className="qs__line">
      <span className="num">{String(num).padStart(2, "0")}</span>
      <span className="cmd">
        <span className="g">$</span>{" "}
        <span>{cmd}</span>
        <span className="c">{comment}</span>
      </span>
      <button
        className="copy"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? (
          <>
            <IconCheck style={{ width: 12, height: 12, verticalAlign: "-1px" }} />{" "}
            {copiedLabel}
          </>
        ) : (
          <>
            <IconCopy style={{ width: 12, height: 12, verticalAlign: "-1px" }} />{" "}
            {copyLabel}
          </>
        )}
      </button>
    </div>
  );
}

export function Quickstart() {
  const c = useC();
  const q = c.quickstart;
  return (
    <section id="selfhost">
      <div className="wrap">
        <div className="reveal">
          <span className="section-label">{q.label}</span>
          <h2 className="section-title">{q.title}</h2>
          <p className="lead">{q.lead}</p>
        </div>
        <div className="qs__card reveal">
          <div className="qs__head">
            <div className="term__dots">
              <i /><i /><i />
            </div>
            <div className="term__title">zsh — chatmux self-host</div>
          </div>
          <div className="qs__body">
            {q.steps.map((s, i) => (
              <CmdLine
                key={i}
                num={i + 1}
                code={s.code}
                copyLabel={q.copy}
                copiedLabel={q.copied}
              />
            ))}
          </div>
          <p className="qs__result">{q.result}</p>
          <div className="qs__foot">
            <a
              href="https://github.com/binjie09/ChatMux/blob/main/docs/web-deployment.md"
              target="_blank"
              rel="noreferrer noopener"
            >
              {q.docs}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Download ---------------- */
const PLATFORM_ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  macOS: IconApple,
  Windows: IconWindows,
  Linux: IconLinux,
  Android: IconAndroid,
  iOS: IconApple,
  Web: IconGlobe,
};

export function Download() {
  const c = useC();
  const d = c.download;
  return (
    <section id="download">
      <div className="wrap">
        <div className="reveal">
          <span className="section-label">{d.label}</span>
          <h2 className="section-title">{d.title}</h2>
          <p className="lead">{d.lead}</p>
        </div>
        <div className="dl__grid">
          {d.platforms.map((p) => {
            const Ico = PLATFORM_ICONS[p.name] ?? IconGlobe;
            return (
              <a
                key={p.name}
                className="dl__card reveal"
                href={p.href}
                target={p.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer noopener"
              >
                <span className="pl">
                  <Ico />
                </span>
                <span className="meta">
                  <h4>{p.name}</h4>
                  <div className="d">{p.detail}</div>
                  <div className="n">{p.note}</div>
                </span>
                <IconArrow className="ar" style={{ width: 18, height: 18 }} />
              </a>
            );
          })}
        </div>
        <div className="reveal" style={{ marginTop: 22 }}>
          <a
            className="dl__more"
            href="https://github.com/binjie09/ChatMux/releases"
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconGithub style={{ width: 17, height: 17 }} />
            {d.releases}
            <IconArrow style={{ width: 15, height: 15 }} />
          </a>
          <p className="dl__note">{d.note}</p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- CTA ---------------- */
export function CTA() {
  const c = useC();
  return (
    <section id="cta">
      <div className="wrap">
        <div className="cta__box reveal">
          <h2>{c.cta.title}</h2>
          <p>{c.cta.sub}</p>
          <div className="hero__cta">
            <a className="btn btn--primary" href="#selfhost">
              {c.cta.primary}
            </a>
            <a
              className="btn btn--ghost"
              href="https://github.com/binjie09/ChatMux"
              target="_blank"
              rel="noreferrer noopener"
            >
              <IconGithub style={{ width: 17, height: 17 }} />
              {c.cta.secondary}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
