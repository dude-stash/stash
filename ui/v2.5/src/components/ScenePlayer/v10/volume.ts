import React, { useCallback, useEffect, useRef } from "react";
import { usePlayer } from "@videojs/react/video";
import localForage from "localforage";

// The keys persist-volume.ts saves the v7 player's volume under, so both players share it.
const levelKey = "volume-level";
const mutedKey = "volume-muted";

// Port of persist-volume.ts. Each stream gets a new video element at full volume, so the saved volume is applied to each one as it loads.
export function usePersistVolume() {
  const store = usePlayer();
  const saved = useRef<{ level?: number; muted?: boolean }>({});

  useEffect(() => {
    Promise.all([
      localForage.getItem<number>(levelKey),
      localForage.getItem<boolean>(mutedKey),
    ]).then(([level, muted]) => {
      if (level !== null) saved.current.level = level;
      if (muted !== null) saved.current.muted = muted;
      // In case the first video loaded before the saved volume was read.
      if (level !== null) store.setVolume(level);
      if (muted !== null) store.setMuted(muted);
    });
  }, [store]);

  const applyVolume = useCallback((el: HTMLVideoElement) => {
    const { level, muted } = saved.current;
    if (level !== undefined) el.volume = level;
    if (muted !== undefined) el.muted = muted;
  }, []);

  const onVolumeChange = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const { volume, muted } = event.currentTarget;
      saved.current = { level: volume, muted };
      localForage.setItem(levelKey, volume);
      localForage.setItem(mutedKey, muted);
    },
    []
  );

  return { applyVolume, onVolumeChange };
}
