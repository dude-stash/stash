import React, { useMemo } from "react";
import { getTagColors, IMarker, layerRangeMarkers } from "../marker-layout";

const LAYER_HEIGHT = 9;

// Port of markers.ts: dots for point markers and stacked bars for ranges, coloured by primary tag. Titles come from the chapter track.
export const Markers: React.FC<{
  markers: IMarker[];
  duration: number;
  showRanges: boolean;
}> = ({ markers, duration, showRanges }) => {
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

  if (!duration) return null;
  const percent = (seconds: number) => `${(seconds / duration) * 100}%`;

  return (
    <div className="stash-markers">
      {dots.map((marker) => (
        <div
          key={`${marker.seconds}-${marker.title}`}
          className="stash-marker"
          style={{
            left: percent(marker.seconds),
            backgroundColor: colors[marker.primaryTag.name],
          }}
        />
      ))}
      {layers.map((layer, layerNum) =>
        layer.map((marker) => (
          <div
            key={`${marker.seconds}-${marker.title}`}
            className="stash-marker-range"
            title={marker.title}
            style={{
              left: percent(marker.seconds),
              width: percent(
                Math.min(marker.end_seconds ?? 0, duration) - marker.seconds
              ),
              bottom: `calc(100% + ${layerNum * LAYER_HEIGHT}px)`,
              backgroundColor: colors[marker.primaryTag.name],
            }}
          />
        ))
      )}
    </div>
  );
};
