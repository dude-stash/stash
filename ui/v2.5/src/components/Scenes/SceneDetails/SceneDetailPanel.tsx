import React, { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { faCopy, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "src/components/Shared/Icon";
import * as GQL from "src/core/generated-graphql";
import TextUtils from "src/utils/text";
import { TagLink } from "src/components/Shared/TagLink";
import { PerformerCard } from "src/components/Performers/PerformerCard";
import { sortPerformers } from "src/core/performers";
import { DirectorLink } from "src/components/Shared/Link";
import { CustomFields } from "src/components/Shared/CustomFields";
import { Tag, TagSelect } from "src/components/Tags/TagSelect";
import {
  Performer,
  PerformerSelect,
} from "src/components/Performers/PerformerSelect";

interface ISceneDetailProps {
  scene: GQL.SceneDataFragment;
  onSave?: (input: { tag_ids: string[]; performer_ids: string[] }) => void;
}

export const SceneDetailPanel: React.FC<ISceneDetailProps> = (props) => {
  const intl = useIntl();
  const { scene, onSave } = props;

  const [addTagKey, setAddTagKey] = useState(0);
  const [isAddingTags, setIsAddingTags] = useState(false);
  const [addPerformerKey, setAddPerformerKey] = useState(0);
  const [isAddingPerformers, setIsAddingPerformers] = useState(false);

  function onAddTags(items: Tag[]) {
    if (items.length === 0) return;
    const existingIds = scene.tags.map((t) => t.id);
    const allIds = [...new Set([...existingIds, ...items.map((t) => t.id)])];
    onSave?.({
      tag_ids: allIds,
      performer_ids: scene.performers.map((p) => p.id),
    });
    setAddTagKey((k) => k + 1);
    setIsAddingTags(false);
  }

  function onAddPerformers(items: Performer[]) {
    if (items.length === 0) return;
    const existingIds = scene.performers.map((p) => p.id);
    const allIds = [...new Set([...existingIds, ...items.map((p) => p.id)])];
    onSave?.({
      tag_ids: scene.tags.map((t) => t.id),
      performer_ids: allIds,
    });
    setAddPerformerKey((k) => k + 1);
    setIsAddingPerformers(false);
  }

  function renderDetails() {
    if (!props.scene.details || props.scene.details === "") return;
    return (
      <>
        <h6>
          <FormattedMessage id="details" />:{" "}
        </h6>
        <p className="pre">{props.scene.details}</p>
      </>
    );
  }

  function renderTags() {
    if (props.scene.tags.length === 0 && !onSave) return;
    const tagLinks = props.scene.tags.map((tag) => (
      <TagLink key={tag.id} tag={tag} />
    ));
    return (
      <>
        <h6>
          <FormattedMessage
            id="countables.tags"
            values={{ count: props.scene.tags.length }}
          />
          {props.scene.tags.length > 0 && (
            <button
              type="button"
              className="btn btn-link copy-field-btn"
              title={intl.formatMessage({ id: "copy_to_clipboard" })}
              onClick={() =>
                navigator.clipboard.writeText(
                  props.scene.tags.map((t) => t.name).join(", ")
                )
              }
            >
              <Icon icon={faCopy} />
            </button>
          )}
        </h6>
        {tagLinks}
        {onSave && !isAddingTags && (
          <button
            type="button"
            className="btn btn-link add-field-btn"
            onClick={() => setIsAddingTags(true)}
          >
            <Icon icon={faPlus} />
          </button>
        )}
        {onSave && isAddingTags && (
          <TagSelect
            key={addTagKey}
            isMulti
            onSelect={onAddTags}
            values={[] as Tag[]}
            noSelectionString={intl.formatMessage(
              { id: "actions.add_entity" },
              {
                entityType: intl
                  .formatMessage({ id: "tag" })
                  .toLocaleLowerCase(),
              }
            )}
            onBlur={() => setIsAddingTags(false)}
          />
        )}
      </>
    );
  }

  function renderPerformers() {
    if (props.scene.performers.length === 0 && !onSave) return;
    const performers = sortPerformers(props.scene.performers);
    const cards = performers.map((performer) => (
      <PerformerCard
        key={performer.id}
        performer={performer}
        ageFromDate={props.scene.date ?? undefined}
      />
    ));

    return (
      <>
        <h6>
          <FormattedMessage
            id="countables.performers"
            values={{ count: props.scene.performers.length }}
          />
          {props.scene.performers.length > 0 && (
            <button
              type="button"
              className="btn btn-link copy-field-btn"
              title={intl.formatMessage({ id: "copy_to_clipboard" })}
              onClick={() =>
                navigator.clipboard.writeText(
                  props.scene.performers.map((p) => p.name).join(", ")
                )
              }
            >
              <Icon icon={faCopy} />
            </button>
          )}
        </h6>
        {performers.length > 0 && (
          <p className="scene-performer-names">
            {performers.map((p, i) => (
              <span key={p.id}>
                <a href={`/performers/${p.id}`}>{p.name}</a>
                {i < performers.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        )}
        <div className="row justify-content-center scene-performers">
          {cards}
        </div>
        {onSave && !isAddingPerformers && (
          <button
            type="button"
            className="btn btn-link add-field-btn"
            onClick={() => setIsAddingPerformers(true)}
          >
            <Icon icon={faPlus} />
          </button>
        )}
        {onSave && isAddingPerformers && (
          <PerformerSelect
            key={addPerformerKey}
            isMulti
            onSelect={onAddPerformers}
            values={[] as Performer[]}
            noSelectionString={intl.formatMessage(
              { id: "actions.add_entity" },
              {
                entityType: intl
                  .formatMessage({ id: "performer" })
                  .toLocaleLowerCase(),
              }
            )}
            onBlur={() => setIsAddingPerformers(false)}
          />
        )}
      </>
    );
  }

  // filename should use entire row if there is no studio
  const sceneDetailsWidth = props.scene.studio ? "col-9" : "col-12";

  return (
    <>
      <div className="row">
        <div className={`${sceneDetailsWidth} col-12 scene-details`}>
          <h6>
            <FormattedMessage id="created_at" />:{" "}
            {TextUtils.formatDateTime(intl, props.scene.created_at)}{" "}
          </h6>
          <h6>
            <FormattedMessage id="updated_at" />:{" "}
            {TextUtils.formatDateTime(intl, props.scene.updated_at)}{" "}
          </h6>
          {props.scene.code && (
            <h6>
              <FormattedMessage id="scene_code" />: {props.scene.code}{" "}
            </h6>
          )}
          {props.scene.director && (
            <h6>
              <FormattedMessage id="director" />:{" "}
              <DirectorLink director={props.scene.director} linkType="scene" />
            </h6>
          )}
        </div>
      </div>
      <div className="row">
        <div className="col-12">
          {renderDetails()}
          {renderTags()}
          {renderPerformers()}
          <CustomFields values={props.scene.custom_fields} fullWidth />
        </div>
      </div>
    </>
  );
};

export default SceneDetailPanel;
