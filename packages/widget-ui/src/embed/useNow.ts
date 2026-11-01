import { useEffect, useState } from "react";

/**
 * A clock that ticks once a minute, for the relative dates in the header
 * ("updated 2 days ago") and the source cards. `Widget` would otherwise
 * default `now` to `new Date()` on every render, which is correct but makes
 * two renders of the same props disagree.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
