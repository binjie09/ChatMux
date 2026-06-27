import { useEffect, useState } from "react";

/**
 * Wide-desktop breakpoint: at or above this width the app shows the full
 * three-column shell with resizable columns. Below it the layout falls back to
 * the tablet/mobile rules in styles.css.
 */
const wideDesktopQuery = "(min-width: 981px)";

export function useIsWideDesktop() {
  const [isWideDesktop, setIsWideDesktop] = useState(() => matchesWideDesktop());

  useEffect(() => {
    const query = window.matchMedia(wideDesktopQuery);
    const update = () => setIsWideDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isWideDesktop;
}

function matchesWideDesktop() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(wideDesktopQuery).matches;
}
