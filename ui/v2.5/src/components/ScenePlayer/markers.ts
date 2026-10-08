import videojs, { VideoJsPlayer } from "video.js";
import { getTagColors, layerRangeMarkers, type IMarker } from "./marker-layout";

export type { IMarker };

interface IMarkersOptions {
  markers?: IMarker[];
}

class MarkersPlugin extends videojs.getPlugin("plugin") {
  private markers: IMarker[] = [];
  private markerDivs: {
    dot?: HTMLDivElement;
    range?: HTMLDivElement;
    containedRanges?: HTMLDivElement[];
  }[] = [];
  private markerTooltip: HTMLElement | null = null;
  private defaultTooltip: HTMLElement | null = null;

  private layerHeight: number = 9;

  private tagColors: { [tag: string]: string } = {};

  constructor(player: VideoJsPlayer) {
    super(player);
    player.ready(() => {
      const tooltip = videojs.dom.createEl("div") as HTMLElement;
      tooltip.className = "vjs-marker-tooltip";
      tooltip.style.visibility = "hidden";

      const parent = player
        .el()
        .querySelector(".vjs-progress-holder .vjs-mouse-display");
      if (parent) parent.appendChild(tooltip);
      this.markerTooltip = tooltip;

      this.defaultTooltip = player
        .el()
        .querySelector<HTMLElement>(
          ".vjs-progress-holder .vjs-mouse-display .vjs-time-tooltip"
        );
    });
  }

  private showMarkerTooltip(title: string, layer: number = 0) {
    if (!this.markerTooltip) return;
    this.markerTooltip.innerText = title;
    this.markerTooltip.style.right = `${-this.markerTooltip.clientWidth / 2}px`;
    this.markerTooltip.style.top = `-${this.layerHeight * layer + 50}px`;
    this.markerTooltip.style.visibility = "visible";
    if (this.defaultTooltip) this.defaultTooltip.style.visibility = "hidden";
  }

  private hideMarkerTooltip() {
    if (this.markerTooltip) this.markerTooltip.style.visibility = "hidden";
    if (this.defaultTooltip) this.defaultTooltip.style.visibility = "visible";
  }

  addDotMarker(marker: IMarker) {
    const duration = this.player.duration();
    const markerSet: {
      dot?: HTMLDivElement;
      range?: HTMLDivElement;
    } = {};
    const seekBar = this.player.el().querySelector(".vjs-progress-holder");

    markerSet.dot = videojs.dom.createEl("div") as HTMLDivElement;
    markerSet.dot.className = "vjs-marker";
    if (duration) {
      // marker is 6px wide - adjust by 3px to align to center not left side
      markerSet.dot.style.left = `calc(${
        (marker.seconds / duration) * 100
      }% - 3px)`;
      markerSet.dot.style.visibility = "visible";
    }

    // Add event listeners to dot
    markerSet.dot.addEventListener("click", () =>
      this.player.currentTime(marker.seconds)
    );
    markerSet.dot.toggleAttribute("marker-tooltip-shown", true);

    // Set background color based on tag (if available)
    if (marker.primaryTag?.name && this.tagColors[marker.primaryTag.name]) {
      markerSet.dot.style.backgroundColor =
        this.tagColors[marker.primaryTag.name];
    }
    markerSet.dot.addEventListener("mouseenter", () => {
      this.showMarkerTooltip(marker.title);
      markerSet.dot?.toggleAttribute("marker-tooltip-shown", true);
    });

    markerSet.dot.addEventListener("mouseout", () => {
      this.hideMarkerTooltip();
      markerSet.dot?.toggleAttribute("marker-tooltip-shown", false);
    });

    if (seekBar) {
      seekBar.appendChild(markerSet.dot);
    }
    this.markers.push(marker);
    this.markerDivs.push(markerSet);
  }

  addDotMarkers(markers: IMarker[]) {
    markers.forEach(this.addDotMarker, this);
  }

  private renderRangeMarkers(markers: IMarker[], layer: number) {
    const duration = this.player.duration();
    const parent = this.player.el().querySelector(".vjs-progress-control");
    const seekBar = this.player.el().querySelector(".vjs-progress-holder");
    if (!seekBar || !parent || !duration) return;

    markers.forEach((marker) => {
      this.renderRangeMarker(marker, layer, duration, seekBar, parent);
    });
  }

  private renderRangeMarker(
    marker: IMarker,
    layer: number,
    duration: number,
    _seekBar: Element,
    parent: Element
  ) {
    if (!marker.end_seconds) return;

    const markerSet: {
      dot?: HTMLDivElement;
      range?: HTMLDivElement;
    } = {};
    const rangeDiv = videojs.dom.createEl("div") as HTMLDivElement;
    rangeDiv.className = "vjs-marker-range";

    // Use percentage-based positioning for proper scaling in fullscreen mode
    // The range marker is inside vjs-progress-control, but needs to align with
    // vjs-progress-holder which has 15px margins on each side.
    // We use calc() to combine percentage positioning with the fixed margin offset.
    const startPercent = (marker.seconds / duration) * 100;
    const widthPercent =
      ((marker.end_seconds - marker.seconds) / duration) * 100;

    // left: 15px margin + percentage of the progress holder width
    // Since progress-holder has margin: 0 15px, we need calc(15px + X% of remaining width)
    // The progress-holder width is (100% - 30px), so the actual left position is:
    // 15px + startPercent% * (100% - 30px) = 15px + startPercent% * 100% - startPercent% * 30px
    rangeDiv.style.left = `calc(15px + ${startPercent}% - ${
      startPercent * 0.3
    }px)`;

    rangeDiv.style.width = `calc(${widthPercent}% - ${widthPercent * 0.3}px)`;
    rangeDiv.style.bottom = `${layer * this.layerHeight}px`; // Adjust height based on layer
    rangeDiv.style.display = "none"; // Initially hidden

    // Set background color based on tag (if available)
    if (marker.primaryTag?.name && this.tagColors[marker.primaryTag.name]) {
      rangeDiv.style.backgroundColor = this.tagColors[marker.primaryTag.name];
    }

    markerSet.range = rangeDiv;
    markerSet.range.style.display = "block";
    markerSet.range.addEventListener("pointermove", (e) => {
      e.stopPropagation();
    });
    markerSet.range.addEventListener("pointerover", (e) => {
      e.stopPropagation();
    });
    markerSet.range.addEventListener("pointerout", (e) => {
      e.stopPropagation();
    });
    markerSet.range.addEventListener("mouseenter", () => {
      this.showMarkerTooltip(marker.title, layer);
      markerSet.range?.toggleAttribute("marker-tooltip-shown", true);
    });

    markerSet.range.addEventListener("mouseout", () => {
      this.hideMarkerTooltip();
      markerSet.range?.toggleAttribute("marker-tooltip-shown", false);
    });
    parent.appendChild(rangeDiv);
    this.markers.push(marker);
    this.markerDivs.push(markerSet);
  }

  addRangeMarkers(markers: IMarker[]) {
    layerRangeMarkers(markers).forEach((layer, layerNum) => {
      this.renderRangeMarkers(layer, layerNum);
    });
  }

  removeMarker(marker: IMarker) {
    const i = this.markers.indexOf(marker);
    if (i === -1) return;

    this.markers.splice(i, 1);
    const markerSet = this.markerDivs.splice(i, 1)[0];

    if (markerSet.dot?.hasAttribute("marker-tooltip-shown")) {
      this.hideMarkerTooltip();
    }

    markerSet.dot?.remove();
    if (markerSet.range) markerSet.range.remove();
  }

  removeMarkers(markers: IMarker[]) {
    markers.forEach(this.removeMarker, this);
  }

  clearMarkers() {
    for (const markerSet of this.markerDivs) {
      if (markerSet.dot?.hasAttribute("marker-tooltip-shown")) {
        this.hideMarkerTooltip();
      }

      markerSet.dot?.remove();
      if (markerSet.range) markerSet.range.remove();
    }
    this.markers = [];
    this.markerDivs = [];
  }

  findColors(tagNames: string[]) {
    Object.assign(this.tagColors, getTagColors(tagNames));
  }
}

videojs.registerPlugin("markers", MarkersPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    markers: () => MarkersPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    markers?: IMarkersOptions;
  }
}

export default MarkersPlugin;
