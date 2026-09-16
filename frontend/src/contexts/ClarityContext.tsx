import React, { createContext, useContext, useState, useEffect } from 'react';

interface ClarityContextValue {
  clarityEnabled: boolean;
  setClarityEnabled: (v: boolean) => void;
}

const ClarityContext = createContext<ClarityContextValue>({
  clarityEnabled: true,
  setClarityEnabled: () => {},
});

export function ClarityProvider({ children }: { children: React.ReactNode }) {
  const [clarityEnabled, setClarityEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('divability-clarity-enabled');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('divability-clarity-enabled', String(clarityEnabled)); } catch {}
  }, [clarityEnabled]);

  return (
    <ClarityContext.Provider value={{ clarityEnabled, setClarityEnabled }}>
      {children}
    </ClarityContext.Provider>
  );
}

export function useClarity() {
  return useContext(ClarityContext);
}
