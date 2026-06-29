import type { Lang } from "./i18n";

type SeoMeta = {
  readonly description: string;
  readonly htmlLang: string;
  readonly imageAlt: string;
  readonly locale: string;
  readonly localeAlternate: string;
  readonly shortDescription: string;
  readonly title: string;
};

const SEO_META: Record<Lang, SeoMeta> = {
  zh: {
    description:
      "ChatMux 是开源的自托管 SSH / tmux 终端客户端：用浏览器、桌面或手机连接你自己的 Gateway，恢复远程 tmux 会话、查看历史上下文，在真实终端里继续工作。支持 xterm.js 真实终端、移动端 SSH、生物识别解锁，全平台。",
    htmlLang: "zh-CN",
    imageAlt: "ChatMux 桌面端工作台截图",
    locale: "zh_CN",
    localeAlternate: "en_US",
    shortDescription:
      "真实终端，随身续接。跨设备的自托管 SSH / tmux 工作空间。",
    title: "ChatMux — 自托管 SSH / tmux 终端客户端（Web · 桌面 · 移动）",
  },
  en: {
    description:
      "ChatMux is an open-source, self-hosted SSH / tmux terminal client. Connect to your own Gateway from the browser, desktop, or phone, restore remote tmux sessions, inspect history, and keep working in a real terminal: xterm.js, mobile SSH, biometric unlock, cross-platform.",
    htmlLang: "en",
    imageAlt: "ChatMux desktop workspace screenshot",
    locale: "en_US",
    localeAlternate: "zh_CN",
    shortDescription:
      "A real terminal that follows you. Self-hosted SSH / tmux workspace across web, desktop, and mobile.",
    title: "ChatMux — Self-hosted SSH / tmux terminal client (Web · Desktop · Mobile)",
  },
};

function setMetaContent(selector: string, content: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute("content", content);
}

export function applySeoMeta(lang: Lang) {
  const meta = SEO_META[lang];

  document.documentElement.lang = meta.htmlLang;
  document.title = meta.title;

  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[property="og:image:alt"]', meta.imageAlt);
  setMetaContent('meta[property="og:locale"]', meta.locale);
  setMetaContent('meta[property="og:locale:alternate"]', meta.localeAlternate);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.shortDescription);
  setMetaContent('meta[name="twitter:image:alt"]', meta.imageAlt);
}
