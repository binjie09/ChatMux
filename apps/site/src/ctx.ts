import { createContext, useContext } from "react";
import { CONTENT, type Content, type Lang } from "./i18n";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; c: Content };

export const LangContext = createContext<Ctx | null>(null);

export function useC(): Content {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useC must be used within LangContext");
  return ctx.c;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangContext");
  return [ctx.lang, ctx.setLang] as const;
}
