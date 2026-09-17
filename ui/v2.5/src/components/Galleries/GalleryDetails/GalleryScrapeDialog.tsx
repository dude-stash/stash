import React, { useState } from "react";
import { useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import {
  ScrapedInputGroupRow,
  ScrapedStringListRow,
  ScrapedTextAreaRow,
} from "src/components/Shared/ScrapeDialog/ScrapeDialogRow";
import { ScrapeDialog } from "src/components/Shared/ScrapeDialog/ScrapeDialog";
import {
  ObjectScrapeResult,
  ScrapeResult,
} from "src/components/Shared/ScrapeDialog/scrapeResult";
import { ScrapedStudioRow } from "src/components/Shared/ScrapeDialog/ScrapedObjectsRow";
import { Performer } from "src/components/Performers/PerformerSelect";
import { useCreateScrapedStudio } from "src/components/Shared/ScrapeDialog/createObjects";
import { uniq } from "lodash-es";
import { Tag } from "src/components/Tags/TagSelect";
import { Studio } from "src/components/Studios/StudioSelect";
import { useScrapedTags } from "src/components/Shared/ScrapeDialog/scrapedTags";
import { useScrapedPerformers } from "src/components/Shared/ScrapeDialog/scrapedPerformers";

interface IGalleryScrapeDialogProps {
  gallery: Partial<GQL.GalleryUpdateInput>;
  galleryStudio: Studio | null;
  galleryTags: Tag[];
  galleryPerformers: Performer[];
  scraped: GQL.ScrapedGallery;

  onClose: (scrapedGallery?: GQL.ScrapedGallery) => void;
}

export const GalleryScrapeDialog: React.FC<IGalleryScrapeDialogProps> = ({
  gallery,
  galleryStudio,
  galleryTags,
  galleryPerformers,
  scraped,
  onClose,
}) => {
  const intl = useIntl();
  const [title, setTitle] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(gallery.title, scraped.title)
  );
  const [code, setCode] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(gallery.code, scraped.code)
  );
  const [urls, setURLs] = useState<ScrapeResult<string[]>>(
    new ScrapeResult<string[]>(
      gallery.urls,
      scraped.urls
        ? uniq((gallery.urls ?? []).concat(scraped.urls ?? []))
        : undefined
    )
  );
  const [date, setDate] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(gallery.date, scraped.date)
  );
  const [photographer, setPhotographer] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(gallery.photographer, scraped.photographer)
  );
  const [studio, setStudio] = useState<ObjectScrapeResult<GQL.ScrapedStudio>>(
    new ObjectScrapeResult<GQL.ScrapedStudio>(
      galleryStudio
        ? {
            stored_id: galleryStudio.id,
            name: galleryStudio.name,
          }
        : undefined,
      scraped.studio
    )
  );
  const [newStudio, setNewStudio] = useState<GQL.ScrapedStudio | undefined>(
    scraped.studio && !scraped.studio.stored_id ? scraped.studio : undefined
  );

  const {
    tags,
    newTags,
    scrapedTagsRow,
    linkDialog: tagsLinkDialog,
  } = useScrapedTags(galleryTags, scraped.tags);

  const {
    performers,
    newPerformers,
    scrapedPerformersRow,
    linkDialog: performersLinkDialog,
  } = useScrapedPerformers(
    galleryPerformers,
    scraped.performers,
    undefined,
    date.useNewValue ? date.newValue : date.originalValue
  );

  const [details, setDetails] = useState<ScrapeResult<string>>(
    new ScrapeResult<string>(gallery.details, scraped.details)
  );

  const createNewStudio = useCreateScrapedStudio({
    scrapeResult: studio,
    setScrapeResult: setStudio,
    setNewObject: setNewStudio,
  });

  // don't show the dialog if nothing was scraped
  if (
    [
      title,
      code,
      urls,
      date,
      photographer,
      studio,
      performers,
      tags,
      details,
    ].every((r) => !r.scraped) &&
    !newStudio &&
    newPerformers.length === 0 &&
    newTags.length === 0
  ) {
    onClose();
    return null;
  }

  function makeNewScrapedItem(): GQL.ScrapedGalleryDataFragment {
    const newStudioValue = studio.getNewValue();

    return {
      title: title.getNewValue(),
      code: code.getNewValue(),
      urls: urls.getNewValue(),
      date: date.getNewValue(),
      photographer: photographer.getNewValue(),
      studio: newStudioValue,
      performers: performers.getNewValue(),
      tags: tags.getNewValue(),
      details: details.getNewValue(),
    };
  }

  function renderScrapeRows() {
    return (
      <>
        <ScrapedInputGroupRow
          field="title"
          title={intl.formatMessage({ id: "title" })}
          result={title}
          onChange={(value) => setTitle(value)}
        />
        <ScrapedInputGroupRow
          field="code"
          title={intl.formatMessage({ id: "scene_code" })}
          result={code}
          onChange={(value) => setCode(value)}
        />
        <ScrapedStringListRow
          field="urls"
          title={intl.formatMessage({ id: "urls" })}
          result={urls}
          onChange={(value) => setURLs(value)}
        />
        <ScrapedInputGroupRow
          field="date"
          title={intl.formatMessage({ id: "date" })}
          placeholder="YYYY-MM-DD"
          result={date}
          onChange={(value) => setDate(value)}
        />
        <ScrapedInputGroupRow
          field="photographer"
          title={intl.formatMessage({ id: "photographer" })}
          result={photographer}
          onChange={(value) => setPhotographer(value)}
        />
        <ScrapedStudioRow
          field="studio"
          title={intl.formatMessage({ id: "studios" })}
          result={studio}
          onChange={(value) => setStudio(value)}
          newStudio={newStudio}
          onCreateNew={createNewStudio}
        />
        {scrapedPerformersRow}
        {scrapedTagsRow}
        <ScrapedTextAreaRow
          field="details"
          title={intl.formatMessage({ id: "details" })}
          result={details}
          onChange={(value) => setDetails(value)}
        />
      </>
    );
  }

  if (tagsLinkDialog) {
    return tagsLinkDialog;
  }

  if (performersLinkDialog) {
    return performersLinkDialog;
  }

  return (
    <ScrapeDialog
      title={intl.formatMessage(
        { id: "dialogs.scrape_entity_title" },
        { entity_type: intl.formatMessage({ id: "gallery" }) }
      )}
      onClose={(apply) => {
        onClose(apply ? makeNewScrapedItem() : undefined);
      }}
    >
      {renderScrapeRows()}
    </ScrapeDialog>
  );
};
