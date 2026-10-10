import React, { useEffect, useMemo, useState } from "react";
import { getTagColors, IMarker, layerRangeMarkers } from "../marker-layout";

const LAYER_HEIGHT = 9;

interface IMarkersProps {
  markers: IMarker[];
  duration: number;
  showRanges: boolean;
  onSeek: (seconds: number) => void;
  onHover: (marker?: IMarker) => void;
}

// Port of markers.ts: dots for point markers and stacked bars for ranges, coloured by primary tag.
export const Markers: React.FC<IMarkersProps> = ({
  markers,
  duration,
  showRanges,
  onSeek,
  onHover,
}) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const colors = useMemo(
    () =>
      getTagColors(Array.from(new Set(markers.map((m) => m.primaryTag.name)))),
    [markers]
  );

  const { dots, layers } = useMemo(() => {
    // Markers copied from a longer cut of the scene can lie past the end of the file.
    const inFile = markers.filter((m) => m.seconds < duration);
    const ranges = showRanges ? inFile.filter((m) => m.end_seconds) : [];
    return {
      dots: inFile.filter((m) => !ranges.includes(m)),
      layers: layerRangeMarkers(ranges),
    };
  }, [markers, showRanges, duration]);

  // A press on a dot would also start a drag on the slider beneath, which would take the click, so it stops at the dot.
  useEffect(() => {
    if (!container) return;
    const stop = (event: Event) => {
      if ((event.target as Element).closest(".stash-marker")) {
        event.stopPropagation();
      }
    };
    container.addEventListener("pointerdown", stop);
    return () => container.removeEventListener("pointerdown", stop);
  }, [container]);

  // The slider's hover preview sits right above the bar, where range markers are drawn, so it is raised above them as in v7.
  useEffect(() => {
    const slider = container?.parentElement;
    if (!slider) return;
    slider.style.setProperty(
      "--stash-range-height",
      `${layers.length * LAYER_HEIGHT}px`
    );
    return () => {
      slider.style.removeProperty("--stash-range-height");
    };
  }, [container, layers.length]);

  if (!duration) return null;
  const percent = (seconds: number) => `${(seconds / duration) * 100}%`;

  return (
    <div ref={setContainer} className="stash-markers">
      {dots.map((marker, i) => (
        <div
          key={`${i}-${marker.seconds}`}
          className="stash-marker"
          style={{
            left: percent(marker.seconds),
            backgroundColor: colors[marker.primaryTag.name],
          }}
          onClick={() => onSeek(marker.seconds)}
          onPointerEnter={() => onHover(marker)}
          onPointerLeave={() => onHover(undefined)}
        />
      ))}
      {layers.map((layer, layerNum) =>
        layer.map((marker, i) => (
          <div
            key={`${layerNum}-${i}-${marker.seconds}`}
            className="stash-marker-range"
            style={{
              left: percent(marker.seconds),
              width: percent(
                Math.min(marker.end_seconds ?? 0, duration) - marker.seconds
              ),
              bottom: `calc(100% + ${layerNum * LAYER_HEIGHT}px)`,
              backgroundColor: colors[marker.primaryTag.name],
            }}
            onPointerEnter={() => onHover(marker)}
            onPointerLeave={() => onHover(undefined)}
          />
        ))
      )}
    </div>
  );
};
