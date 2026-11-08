import { useCallback, useEffect, useState } from "react";

import { readFlagPref, writeFlagPref } from "@/lib/local-settings";

/**
 * A yes/no preference kept in this browser. The first render uses the fallback (so server render
 * and hydration match); the stored value applies right after.
 */
export function useFlagPref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => setValue(readFlagPref(key, fallback)), [key, fallback]);
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      writeFlagPref(key, v);
    },
    [key],
  );
  return [value, set];
}
