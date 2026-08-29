import React, { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import * as GQL from "src/core/generated-graphql";
import { ModalComponent } from "src/components/Shared/Modal";
import { faLink } from "@fortawesome/free-solid-svg-icons";
import { Form } from "react-bootstrap";
import { Performer, PerformerSelect } from "../../Performers/PerformerSelect";
import { scrapedPerformerToCreateInput } from "src/core/performers";

export const CreateLinkPerformerDialog: React.FC<{
  performer: GQL.ScrapedPerformer;
  onClose: (result: {
    create?: GQL.PerformerCreateInput;
    update?: GQL.PerformerUpdateInput;
  }) => void;
  endpoint?: string;
}> = ({ performer, onClose, endpoint }) => {
  const intl = useIntl();

  const [createNew, setCreateNew] = useState(false);
  const [name, setName] = useState(performer.name ?? "");
  const [existingPerformer, setExistingPerformer] = useState<Performer | null>(
    null
  );
  const [addAsAlias, setAddAsAlias] = useState(false);

  const canAddAlias = (createNew && name !== performer.name) || !createNew;

  useEffect(() => {
    setAddAsAlias(canAddAlias);
  }, [canAddAlias]);

  function handlePerformerSave() {
    if (createNew) {
      const createInput = scrapedPerformerToCreateInput(
        { ...performer, name },
        endpoint
      );

      if (addAsAlias && performer.name && performer.name !== name) {
        createInput.alias_list = [
          ...(createInput.alias_list ?? []),
          performer.name,
        ];
      }

      onClose({ create: createInput });
    } else if (existingPerformer) {
      const updateInput: GQL.PerformerUpdateInput = {
        id: existingPerformer.id,
        alias_list: addAsAlias
          ? [...(existingPerformer.alias_list ?? []), performer.name ?? ""]
          : undefined,
      };
      onClose({ update: updateInput });
    }
  }

  return (
    <ModalComponent
      show={true}
      accept={{
        text: intl.formatMessage({ id: "actions.save" }),
        onClick: () => handlePerformerSave(),
      }}
      disabled={createNew ? name.trim() === "" : existingPerformer === null}
      cancel={{
        text: intl.formatMessage({ id: "actions.cancel" }),
        onClick: () => {
          onClose({});
        },
      }}
      dialogClassName="create-link-performer-modal"
      icon={faLink}
      header={intl.formatMessage({
        id: "component_tagger.verb_match_performer",
      })}
    >
      <Form>
        <Form.Check
          type="radio"
          id="create-new"
          label={intl.formatMessage({ id: "actions.create_new" })}
          checked={createNew}
          onChange={() => setCreateNew(true)}
        />

        <Form.Group className="ml-3 mt-2">
          <Form.Label>
            <FormattedMessage id="name" />
          </Form.Label>
          <Form.Control
            className="input-control"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!createNew}
          />
        </Form.Group>

        <Form.Check
          type="radio"
          id="link-existing"
          label={intl.formatMessage({
            id: "component_tagger.verb_link_existing",
          })}
          checked={!createNew}
          onChange={() => setCreateNew(false)}
        />

        <Form.Group className="ml-3 mt-2">
          <PerformerSelect
            isMulti={false}
            values={existingPerformer ? [existingPerformer] : []}
            onSelect={(p) => setExistingPerformer(p.length > 0 ? p[0] : null)}
            isDisabled={createNew}
            menuPortalTarget={document.body}
          />
        </Form.Group>

        <Form.Group className="mt-3">
          <Form.Check
            type="checkbox"
            id="add-as-alias"
            label={intl.formatMessage({
              id: "component_tagger.verb_add_as_alias",
            })}
            checked={addAsAlias}
            onChange={() => setAddAsAlias(!addAsAlias)}
            disabled={!canAddAlias}
          />
        </Form.Group>
      </Form>
    </ModalComponent>
  );
};
