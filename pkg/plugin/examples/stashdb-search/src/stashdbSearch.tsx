/**
 * PoC UI plugin: search a configured stash-box (e.g. stashdb.org) using its
 * queryScenes(input: SceneQueryInput!) operation.
 *
 * Stash's own built-in stash-box integration only ever calls searchScene
 * (free text) or findScenesBySceneFingerprints (file hash match) - see
 * pkg/stashbox/scene.go. queryScenes supports many more filters (title,
 * code, url, date range, pagination, sort) that Stash never exposes in its
 * UI. This plugin adds a page that calls queryScenes directly.
 *
 * It reuses the api_key/endpoint already configured under
 * Settings > Metadata Providers (Configuration > general > stashBoxes) -
 * no separate credentials UI needed for this PoC.
 */

interface IPluginApi {
  React: typeof React;
  GQL: any;
  libraries: {
    Bootstrap: {
      Button: React.FC<any>;
      Form: any;
      Table: React.FC<any>;
      Alert: React.FC<any>;
      Spinner: React.FC<any>;
    };
    ReactRouterDOM: {
      NavLink: React.FC<any>;
    };
    FontAwesomeSolid: {
      faSearch: any;
    };
  };
  components: Record<string, React.FC<any>>;
  patch: {
    before: (target: string, fn: Function) => void;
  };
  register: {
    route: (path: string, component: React.FC<any>) => void;
  };
}

(function () {
  const PluginApi = (window as any).PluginApi as IPluginApi;
  const React = PluginApi.React;
  const GQL = PluginApi.GQL;

  const { Button, Form, Table, Alert, Spinner } = PluginApi.libraries.Bootstrap;
  const { NavLink } = PluginApi.libraries.ReactRouterDOM;
  const { faSearch } = PluginApi.libraries.FontAwesomeSolid;

  const ROUTE = "/plugins/stashdb-search";

  // Modifiers available on stash-box's StringCriterionInput/DateCriterionInput.
  // See pkg/stashbox/graphql/generated_models.go CriterionModifier.
  const STRING_MODIFIERS = ["EQUALS", "NOT_EQUALS", "INCLUDES", "EXCLUDES"];
  const SORT_OPTIONS = [
    "TITLE",
    "DATE",
    "DURATION",
    "TRENDING",
    "POPULARITY",
    "CREATED_AT",
    "UPDATED_AT",
  ];

  const QUERY_SCENES_DOCUMENT = `
    query PluginQueryScenes($input: SceneQueryInput!) {
      queryScenes(input: $input) {
        count
        scenes {
          id
          title
          date
          code
          duration
          studio {
            name
          }
          performers {
            performer {
              name
            }
          }
          urls {
            url
          }
        }
      }
    }
  `;

  interface StashBoxEntry {
    name: string;
    endpoint: string;
    api_key: string;
  }

  function useStashDBBox(): StashBoxEntry | undefined {
    const { data } = GQL.useConfigurationQuery();
    return React.useMemo(() => {
      const boxes: StashBoxEntry[] =
        data?.configuration?.general?.stashBoxes ?? [];
      return boxes.find((b) => b.endpoint.includes("stashdb.org")) ?? boxes[0];
    }, [data]);
  }

  async function runQueryScenes(box: StashBoxEntry, input: Record<string, any>) {
    const res = await fetch(box.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // stash-box expects the api key in this header, not Authorization -
        // see pkg/stashbox/client.go setApiKeyHeader.
        ApiKey: box.api_key,
      },
      body: JSON.stringify({
        query: QUERY_SCENES_DOCUMENT,
        variables: { input },
      }),
    });

    if (!res.ok) {
      throw new Error(`stash-box returned HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map((e: any) => e.message).join("; "));
    }

    return json.data.queryScenes as {
      count: number;
      scenes: any[];
    };
  }

  const SearchPage: React.FC = () => {
    const box = useStashDBBox();

    const [title, setTitle] = React.useState("");
    const [titleModifier, setTitleModifier] = React.useState("INCLUDES");
    const [code, setCode] = React.useState("");
    const [url, setUrl] = React.useState("");
    const [date, setDate] = React.useState("");
    const [dateModifier, setDateModifier] = React.useState("EQUALS");
    const [perPage, setPerPage] = React.useState(20);
    const [sort, setSort] = React.useState("DATE");
    const [direction, setDirection] = React.useState("DESC");

    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | undefined>();
    const [result, setResult] = React.useState<
      { count: number; scenes: any[] } | undefined
    >();

    function buildInput() {
      const input: Record<string, any> = {
        page: 1,
        per_page: perPage,
        sort,
        direction,
      };

      if (title.trim()) {
        input.title = title.trim();
      }
      if (code.trim()) {
        input.code = { value: code.trim(), modifier: titleModifier };
      }
      if (url.trim()) {
        input.url = url.trim();
      }
      if (date.trim()) {
        input.date = { value: date.trim(), modifier: dateModifier };
      }

      return input;
    }

    async function onSearch(e: React.FormEvent) {
      e.preventDefault();
      if (!box) return;

      setLoading(true);
      setError(undefined);
      try {
        const r = await runQueryScenes(box, buildInput());
        setResult(r);
      } catch (err: any) {
        setError(err.message ?? String(err));
        setResult(undefined);
      } finally {
        setLoading(false);
      }
    }

    if (!box) {
      return (
        <div className="stashdb-search-page">
          <Alert variant="warning">
            No stash-box instance is configured. Add one under Settings &gt;
            Metadata Providers first - this plugin reuses that endpoint and
            API key.
          </Alert>
        </div>
      );
    }

    return (
      <div className="stashdb-search-page">
        <h3>StashDB advanced scene search</h3>
        <p className="text-muted">
          Querying <code>{box.name || box.endpoint}</code> via{" "}
          <code>queryScenes</code> (title / code / url / date filters,
          pagination and sort) - not just free text or fingerprint match.
        </p>

        <Form onSubmit={onSearch} className="stashdb-search-form">
          <Form.Group className="mb-2">
            <Form.Label>Title contains</Form.Label>
            <Form.Control
              value={title}
              onChange={(e: any) => setTitle(e.target.value)}
              placeholder="e.g. a performer name or scene title"
            />
          </Form.Group>

          <Form.Group className="mb-2 stashdb-search-row">
            <Form.Label>Code</Form.Label>
            <Form.Control
              value={code}
              onChange={(e: any) => setCode(e.target.value)}
            />
            <Form.Select
              value={titleModifier}
              onChange={(e: any) => setTitleModifier(e.target.value)}
            >
              {STRING_MODIFIERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-2">
            <Form.Label>URL contains</Form.Label>
            <Form.Control
              value={url}
              onChange={(e: any) => setUrl(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-2 stashdb-search-row">
            <Form.Label>Date (YYYY-MM-DD)</Form.Label>
            <Form.Control
              value={date}
              onChange={(e: any) => setDate(e.target.value)}
              placeholder="2020-01-01"
            />
            <Form.Select
              value={dateModifier}
              onChange={(e: any) => setDateModifier(e.target.value)}
            >
              <option value="EQUALS">EQUALS</option>
              <option value="GREATER_THAN">GREATER_THAN</option>
              <option value="LESS_THAN">LESS_THAN</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-2 stashdb-search-row">
            <Form.Label>Sort</Form.Label>
            <Form.Select value={sort} onChange={(e: any) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Form.Select>
            <Form.Select
              value={direction}
              onChange={(e: any) => setDirection(e.target.value)}
            >
              <option value="ASC">ASC</option>
              <option value="DESC">DESC</option>
            </Form.Select>
            <Form.Control
              type="number"
              min={1}
              max={100}
              value={perPage}
              onChange={(e: any) => setPerPage(Number(e.target.value))}
            />
          </Form.Group>

          <Button type="submit" disabled={loading}>
            <Icon icon={faSearch} /> {loading ? "Searching..." : "Search"}
          </Button>
        </Form>

        {loading && <Spinner animation="border" className="mt-3" />}
        {error && (
          <Alert variant="danger" className="mt-3">
            {error}
          </Alert>
        )}

        {result && (
          <>
            <p className="mt-3">{result.count} total matches on stash-box</p>
            <Table striped bordered size="sm">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Code</th>
                  <th>Studio</th>
                  <th>Performers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.scenes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{s.date}</td>
                    <td>{s.code}</td>
                    <td>{s.studio?.name}</td>
                    <td>
                      {s.performers
                        .map((p: any) => p.performer.name)
                        .join(", ")}
                    </td>
                    <td>
                      <a
                        href={`${box.endpoint.replace(
                          "/graphql",
                          ""
                        )}/scenes/${s.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        view
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </div>
    );
  };

  function Icon(props: { icon: any }) {
    const { Icon: CoreIcon } = PluginApi.components;
    return <CoreIcon icon={props.icon} />;
  }

  PluginApi.register.route(ROUTE, SearchPage);

  PluginApi.patch.before("MainNavBar.UtilityItems", function (props: any) {
    const { Icon: CoreIcon } = PluginApi.components;

    return [
      {
        children: (
          <>
            {props.children}
            <NavLink className="nav-utility" exact to={ROUTE}>
              <Button
                className="minimal d-flex align-items-center h-100"
                title="StashDB advanced search"
              >
                <CoreIcon icon={faSearch} />
              </Button>
            </NavLink>
          </>
        ),
      },
    ];
  });
})();
