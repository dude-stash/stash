import React, { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { FilteredSceneList } from "src/components/Scenes/SceneList";
import { usePerformerFilterHook } from "src/core/performers";
import { useBulkSceneUpdate } from "src/core/StashService";
import { useToast } from "src/hooks/Toast";
import { PerformersCriterion } from "src/models/list-filter/criteria/performers";
import { ListFilterModel } from "src/models/list-filter/filter";
import { View } from "src/components/List/views";
import { PatchComponent } from "src/patch";

interface IPerformerDetailsProps {
  active: boolean;
  performer: GQL.PerformerDataFragment;
}

export const PerformerScenesPanel: React.FC<IPerformerDetailsProps> =
  PatchComponent("PerformerScenesPanel", ({ active, performer }) => {
    const intl = useIntl();
    const Toast = useToast();
    const [bulkUpdate] = useBulkSceneUpdate();
    const [adding, setAdding] = useState(false);

    const performerFilterHook = usePerformerFilterHook(performer);

    const excludeFilterHook = useCallback(
      (filter: ListFilterModel) => {
        const criterion = new PerformersCriterion();
        criterion.modifier = GQL.CriterionModifier.IncludesAll;
        criterion.value = {
          items: [],
          excluded: [{ id: performer.id, label: performer.name }],
        };
        filter.criteria.push(criterion);
        return filter;
      },
      [performer.id, performer.name]
    );

    const onApply = useCallback(
      async (ids: string[]) => {
        try {
          await bulkUpdate({
            variables: {
              input: {
                ids,
                performer_ids: {
                  ids: [performer.id],
                  mode: GQL.BulkUpdateIdMode.Add,
                },
              },
            },
          });
          Toast.success(
            intl.formatMessage(
              { id: "toast.added_entity" },
              {
                count: ids.length,
                singularEntity: intl.formatMessage({ id: "scene" }),
                pluralEntity: intl.formatMessage({ id: "scenes" }),
              }
            )
          );
        } catch (e) {
          Toast.error(e);
        }
      },
      [bulkUpdate, performer.id, intl, Toast]
    );

    return (
      <FilteredSceneList
        filterHook={adding ? excludeFilterHook : performerFilterHook}
        alterQuery={active}
        view={View.PerformerScenes}
        addMode={{
          active: adding,
          onToggle: () => setAdding((v) => !v),
          title: intl.formatMessage({ id: "actions.add_scenes" }),
          hint: intl.formatMessage(
            { id: "actions.add_scenes_hint" },
            { name: performer.name }
          ),
          label: (count) =>
            intl.formatMessage(
              { id: "actions.add_scenes_to_performer" },
              { count, name: performer.name }
            ),
          onApply,
        }}
      />
    );
  });
