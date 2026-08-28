import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createTranslator } from "../../localization/presentation.mjs";

const DEFAULT_SNAPSHOT = Object.freeze({ preference: "system", effectiveLocale: "en" });
const LocalizationContext = createContext({
  ...DEFAULT_SNAPSHOT,
  t: createTranslator("en"),
  setLocalePreference: async () => DEFAULT_SNAPSHOT
});

export function LocalizationProvider({ api, children }) {
  const [snapshot, setSnapshot] = useState(DEFAULT_SNAPSHOT);

  useEffect(() => {
    let active = true;
    Promise.resolve(api.getLocalizationSnapshot?.())
      .then((next) => { if (active && next) setSnapshot(next); })
      .catch(() => {});
    const unsubscribe = api.onLocalizationChanged?.((next) => {
      if (next) setSnapshot(next);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [api]);

  useEffect(() => {
    document.documentElement.lang = snapshot.effectiveLocale;
  }, [snapshot.effectiveLocale]);

  const value = useMemo(() => ({
    ...snapshot,
    t: createTranslator(snapshot.effectiveLocale),
    setLocalePreference: (locale) => api.setLocalePreference(locale)
  }), [api, snapshot]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
