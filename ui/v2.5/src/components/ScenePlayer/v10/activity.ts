import { useEffect, useRef } from "react";
import { usePlayer } from "@videojs/react/video";
import {
  useSceneIncrementPlayCount,
  useSceneSaveActivity,
} from "src/core/StashService";

const SEND_INTERVAL = 10;

// Port of track-activity.ts: counts the seconds a scene actually plays, and saves its resume point and play time every 10 seconds and whenever playback stops.
export function useTrackActivity(
  sceneId: string,
  enabled: boolean,
  minimumPlayPercent: number
) {
  const store = usePlayer();
  const playing = usePlayer((s) => !s.paused && !s.waiting && !s.ended);
  const [saveActivity] = useSceneSaveActivity();
  const [incrementPlayCount] = useSceneIncrementPlayCount();

  const latest = useRef({
    saveActivity,
    incrementPlayCount,
    minimumPlayPercent,
  });
  latest.current = { saveActivity, incrementPlayCount, minimumPlayPercent };
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;

  const countedScene = useRef<string>();
  const totalPlayed = useRef(0);
  const unsentPlayed = useRef(0);
  const playCounted = useRef(false);
  // The last position seen each second, for when playback stops because the scene changed and the store has moved on.
  const lastTime = useRef(0);
  const lastDuration = useRef(0);

  useEffect(() => {
    if (!enabled || !playing) return;
    const id = sceneId;

    // The previous scene's activity was saved when its playback stopped, so its counts can go.
    if (countedScene.current !== id) {
      countedScene.current = id;
      totalPlayed.current = 0;
      unsentPlayed.current = 0;
      playCounted.current = false;
    }

    lastTime.current = store.currentTime;
    lastDuration.current = store.duration;

    function send() {
      if (totalPlayed.current === 0) return;
      const sameScene = sceneIdRef.current === id;
      const time = sameScene ? store.currentTime : lastTime.current;
      const duration = sameScene ? store.duration : lastDuration.current;
      if (!duration) return;

      const { saveActivity, incrementPlayCount, minimumPlayPercent } =
        latest.current;
      const percentPlayed = (100 / duration) * totalPlayed.current;
      if (!playCounted.current && percentPlayed >= minimumPlayPercent) {
        playCounted.current = true;
        incrementPlayCount({ variables: { id } });
      }

      // As in v7, a scene watched to 98% or more starts from the beginning next time.
      const percentCompleted = (100 / duration) * time;
      saveActivity({
        variables: {
          id,
          playDuration: unsentPlayed.current,
          resume_time: percentCompleted >= 98 ? 0 : time,
        },
      });
      unsentPlayed.current = 0;
    }

    const timer = window.setInterval(() => {
      lastTime.current = store.currentTime;
      lastDuration.current = store.duration;
      totalPlayed.current += 1;
      unsentPlayed.current += 1;
      if (totalPlayed.current % SEND_INTERVAL === 0) send();
    }, 1000);

    return () => {
      window.clearInterval(timer);
      send();
    };
  }, [sceneId, enabled, playing, store]);
}
