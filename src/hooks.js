import { useState, useEffect } from 'react';

export function useIsWide(breakpoint = 768) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= breakpoint);
  useEffect(() => {
    const fn = () => setWide(window.innerWidth >= breakpoint);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [breakpoint]);
  return wide;
}
