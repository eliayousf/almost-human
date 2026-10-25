import React, { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Safari's visible height changes independently when its toolbar or keyboard opens. */
export function useVisibleHeight() {
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(() => Platform.OS === 'web' ? window.visualViewport?.height || height : height);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const viewport = window.visualViewport;
    const update = () => setVisible(viewport?.height || window.innerHeight);
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('pageshow', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.removeEventListener('pageshow', update); window.removeEventListener('orientationchange', update); };
  }, []);
  return Platform.OS === 'web' ? visible : height;
}

export function WebViewport() {
  const height = useVisibleHeight();
  if (Platform.OS !== 'web') return null;
  return <style>{`
    html { height: auto !important; overflow-y: auto !important; overflow-x: hidden; }
    body { height: auto !important; overflow: visible !important; margin: 0; background: #0b0a08; }
    #root { height: ${height}px !important; max-height: 100svh; min-height: 0; }
    [data-testid="live-game-column"] { padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important; padding-top: max(8px, env(safe-area-inset-top, 0px)) !important; }
  `}</style>;
}
