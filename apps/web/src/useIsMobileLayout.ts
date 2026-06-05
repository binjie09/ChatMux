import { useEffect, useState } from "react";

const mobileLayoutQuery = "(max-width: 720px)";

export function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(() => matchesMobileLayout());

  useEffect(() => {
    const query = window.matchMedia(mobileLayoutQuery);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function matchesMobileLayout() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(mobileLayoutQuery).matches;
}
