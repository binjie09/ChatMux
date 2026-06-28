import { useState } from "react";
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

export function MobileShowcase() {
  const c = useC();
  return (
    <section id="mobile">
      <div className="wrap mobile__grid">
        <div className="reveal">
          <span className="section-label">{c.mobile.label}</span>
          <h2 className="section-title">{c.mobile.title}</h2>
          <p className="lead mobile__copy">{c.mobile.lead}</p>
          <ul className="mobile__bullets">
            {c.mobile.captions.map((cap) => (
              <li key={cap}>
                <span className="mk">▸</span>
                <span>
                  <b>{cap.split(" ")[0]}</b>{" "}
                  {cap.replace(/^[^ ]+ ?/, "")}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="phones reveal" style={{ transitionDelay: "120ms" }}>
          {PHONE_SHOTS.map((src, i) => (
            <figure className="phone" key={src}>
              <img
                src={`./shots/${src}`}
                alt={`ChatMux ${c.mobile.captions[i]}`}
                loading="lazy"
                decoding="async"
              />
              <figcaption className="cap">{c.mobile.captions[i]}</figcaption>
            </figure>
          ))}
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
