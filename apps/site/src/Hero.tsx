import { useEffect, useState } from "react";
import { useC, useLang } from "./ctx";
import { IconGithub, IconTerminal } from "./icons";

/* ----------------------------------------------------------------
   The signature moment: an animated ChatMux / tmux session that
   types itself out. Segments carry a colour class; the typewriter
   reveals characters across segments so colour is preserved.
----------------------------------------------------------------- */

type Seg = { t: string; c: string };

const SCRIPT_ZH: Seg[][] = [
  [{ t: "$ ", c: "g" }, { t: "ssh prod-01", c: "" }],
  [{ t: "↳ ", c: "dim" }, { t: "connected", c: "t" }, { t: " · 指纹已信任", c: "dim" }],
  [{ t: "$ ", c: "g" }, { t: "tmux attach -t deploy", c: "" }],
  [{ t: "✓ ", c: "g" }, { t: "session ", c: "dim" }, { t: "deploy", c: "a" }, { t: " · 3 windows · 已恢复上下文", c: "dim" }],
  [{ t: "$ ", c: "g" }, { t: "docker compose up -d --build", c: "" }],
  [{ t: "⠿ ", c: "t" }, { t: "Building ", c: "dim" }, { t: "chatmux-gateway", c: "p" }, { t: " …", c: "dim" }],
  [{ t: "✓ ", c: "g" }, { t: "Gateway ready · ", c: "dim" }, { t: ":19327", c: "g" }],
];

const SCRIPT_EN: Seg[][] = [
  [{ t: "$ ", c: "g" }, { t: "ssh prod-01", c: "" }],
  [{ t: "↳ ", c: "dim" }, { t: "connected", c: "t" }, { t: " · fingerprint trusted", c: "dim" }],
  [{ t: "$ ", c: "g" }, { t: "tmux attach -t deploy", c: "" }],
  [{ t: "✓ ", c: "g" }, { t: "session ", c: "dim" }, { t: "deploy", c: "a" }, { t: " · 3 windows · context restored", c: "dim" }],
  [{ t: "$ ", c: "g" }, { t: "docker compose up -d --build", c: "" }],
  [{ t: "⠿ ", c: "t" }, { t: "Building ", c: "dim" }, { t: "chatmux-gateway", c: "p" }, { t: " …", c: "dim" }],
  [{ t: "✓ ", c: "g" }, { t: "Gateway ready · ", c: "dim" }, { t: ":19327", c: "g" }],
];

function renderLine(segs: Seg[], upto: number) {
  const out: React.ReactNode[] = [];
  let used = 0;
  segs.forEach((s, i) => {
    if (used >= upto) return;
    const take = Math.min(s.t.length, upto - used);
    if (take > 0) {
      out.push(
        <span key={i} className={s.c || undefined}>
          {s.t.slice(0, take)}
        </span>,
      );
      used += take;
    }
  });
  return out;
}

function TerminalHero() {
  const c = useC();
  const [lang] = useLang();
  const script = lang === "en" ? SCRIPT_EN : SCRIPT_ZH;
  const lineLens = script.map((line) => line.reduce((n, s) => n + s.t.length, 0));
  const totalChars = lineLens.reduce((a, b) => a + b, 0);

  const [pos, setPos] = useState(0); // absolute character position across whole script
  const [loopKey, setLoopKey] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPos(totalChars);
      return;
    }
    setPos(0);
    let cur = 0;
    let timer: number;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      cur += 1;
      setPos(cur);
      if (cur >= totalChars) {
        timer = window.setTimeout(() => {
          if (!cancelled) {
            setPos(0);
            cur = 0;
            setLoopKey((k) => k + 1);
            timer = window.setTimeout(step, 700);
          }
        }, 2600);
        return;
      }
      // detect line boundary for a longer pause
      const onBoundary = lineLens.some((L) => L === cur);
      timer = window.setTimeout(step, onBoundary ? 360 : 26);
    };
    timer = window.setTimeout(step, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // re-run when language changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, loopKey, totalChars]);

  // split pos into lines
  const doneLines: React.ReactNode[] = [];
  let remaining = pos;
  let activeIdx = 0;
  for (let i = 0; i < script.length; i++) {
    if (remaining >= lineLens[i]) {
      doneLines.push(
        <span key={i} className="ln">
          {renderLine(script[i], lineLens[i])}
        </span>,
      );
      remaining -= lineLens[i];
      activeIdx = i + 1;
    } else {
      activeIdx = i;
      break;
    }
  }
  const activeLine =
    activeIdx < script.length ? (
      <span key="active" className="ln">
        {renderLine(script[activeIdx], remaining)}
        <span className="caret" />
      </span>
    ) : null;

  const h = c.hero;
  return (
    <div className="term" aria-hidden="true">
      <div className="term__top">
        <div className="term__dots">
          <i /><i /><i />
        </div>
        <div className="term__title">{h.terminalTitle}</div>
      </div>
      <div className="term__body">
        <div className="term__pane">
          {doneLines}
          {activeLine}
        </div>
        <div className="term__side">
          <h6>tmux / sessions</h6>
          <div className={`sess ${pos > lineLens[0] ? "on" : ""}`}>
            <span className={`dot ${pos > lineLens[0] ? "" : "idle"}`} />
            0:deploy <span style={{ marginLeft: "auto", opacity: 0.6 }}>prod</span>
          </div>
          <div className="sess">
            <span className="dot idle" />
            1:logs
          </div>
          <div className="sess">
            <span className="dot idle" />
            2:db-migrate
          </div>
          <h6 style={{ marginTop: 16 }}>cpu · gateway</h6>
          <div className="bar"><i /></div>
        </div>
      </div>
      <div className="term__status">
        <span className="s-left">{h.statusLeft}</span>
        <span className="s-sep">·</span>
        {h.statusSessions.map(([name, mark], i) => (
          <span key={name} className={`s-tab ${i === 0 ? "active" : ""}`}>
            {mark} {name}
          </span>
        ))}
        <span className="s-right">{h.statusRight}</span>
      </div>
    </div>
  );
}

export default function Hero() {
  const c = useC();
  const h = c.hero;
  return (
    <section className="hero" id="top">
      <div className="wrap hero__grid">
        <div className="hero__copy reveal">
          <span className="eyebrow">
            <IconTerminal className="ico" style={{ width: 15, height: 15 }} />
            {h.eyebrow}
          </span>
          <h1 className="display">
            {h.titleLead}
            <br />
            <span className="accent">{h.titleAccent}</span>
          </h1>
          <p className="hero__sub">{h.sub}</p>
          <div className="hero__cta">
            <a className="btn btn--primary" href="#selfhost">
              {h.ctaPrimary}
              <span className="hint">· {h.ctaPrimaryHint}</span>
            </a>
            <a
              className="btn btn--ghost"
              href="https://github.com/binjie09/ChatMux"
              target="_blank"
              rel="noreferrer noopener"
            >
              <IconGithub style={{ width: 17, height: 17 }} />
              {h.ctaSecondary}
            </a>
          </div>
          <dl className="hero__proof">
            {h.proof.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="hero__art reveal" style={{ transitionDelay: "120ms" }}>
          <TerminalHero />
        </div>
      </div>
    </section>
  );
}
