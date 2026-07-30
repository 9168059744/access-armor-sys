/**
 * Wiz -> Slack alerting.
 *
 * The Lovable Wiz connector only feeds the Security tab; it exposes no API to
 * app code. So we authenticate against the Wiz API directly with a customer
 * service account (client credentials) and poll for issues.
 */

const WIZ_AUTH_URL = "https://auth.app.wiz.io/oauth/token";
const SLACK_GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

export type WizIssue = {
  id: string;
  severity: string | null;
  status: string | null;
  title: string;
  entityName: string | null;
  url: string;
  createdAt: string | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getWizAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    audience: "wiz-api",
    client_id: requiredEnv("WIZ_CLIENT_ID"),
    client_secret: requiredEnv("WIZ_CLIENT_SECRET"),
  });

  const res = await fetch(WIZ_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Wiz auth failed [${res.status}]: ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Wiz auth returned no access_token");
  return json.access_token;
}

const ISSUES_QUERY = `
  query LovableIssues($first: Int!, $filterBy: IssueFilters) {
    issues(first: $first, filterBy: $filterBy, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        id
        severity
        status
        createdAt
        entitySnapshot { name type }
        sourceRule { __typename ... on Control { name } ... on CloudEventRule { name } ... on CloudConfigurationRule { name } }
      }
    }
  }
`;

/** Fetch the most recent open issues from the Wiz GraphQL API. */
export async function fetchWizIssues(limit = 50): Promise<WizIssue[]> {
  const apiUrl = requiredEnv("WIZ_API_URL");
  const token = await getWizAccessToken();

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: ISSUES_QUERY,
      variables: { first: limit, filterBy: { status: ["OPEN", "IN_PROGRESS"] } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Wiz API request failed [${res.status}]: ${await res.text()}`);
  }

  const payload = (await res.json()) as {
    data?: { issues?: { nodes?: Array<Record<string, any>> } };
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(`Wiz API errors: ${payload.errors.map((e) => e.message).join("; ")}`);
  }

  const nodes = payload.data?.issues?.nodes ?? [];
  return nodes.map((node) => ({
    id: String(node.id),
    severity: node.severity ?? null,
    status: node.status ?? null,
    title: node.sourceRule?.name ?? "Wiz issue",
    entityName: node.entitySnapshot?.name ?? null,
    url: `https://app.wiz.io/issues#~(issue~'${node.id})`,
    createdAt: node.createdAt ?? null,
  }));
}

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: "🟥",
  HIGH: "🟧",
  MEDIUM: "🟨",
  LOW: "🟦",
  INFORMATIONAL: "⬜",
};

function formatBlocks(issues: WizIssue[]) {
  const lines = issues.map((issue) => {
    const sev = (issue.severity ?? "UNKNOWN").toUpperCase();
    const emoji = SEVERITY_EMOJI[sev] ?? "•";
    const entity = issue.entityName ? ` — \`${issue.entityName}\`` : "";
    return `${emoji} *${sev}* <${issue.url}|${issue.title}>${entity}`;
  });

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Wiz: ${issues.length} new finding${issues.length === 1 ? "" : "s"}`,
      },
    },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
  ];
}

/** Post a batch of new findings to Slack via the connector gateway. */
export async function postFindingsToSlack(issues: WizIssue[]): Promise<void> {
  if (issues.length === 0) return;

  const lovableApiKey = requiredEnv("LOVABLE_API_KEY");
  const slackKey = requiredEnv("SLACK_API_KEY");
  const channel = process.env.WIZ_ALERT_SLACK_CHANNEL ?? "#security-alerts";

  const res = await fetch(`${SLACK_GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": slackKey,
    },
    body: JSON.stringify({
      channel,
      text: `Wiz: ${issues.length} new finding(s)`,
      blocks: formatBlocks(issues),
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Slack gateway request failed [${res.status}]: ${raw}`);
  }

  const body = JSON.parse(raw) as { ok?: boolean; error?: string };
  if (!body.ok) {
    throw new Error(`Slack chat.postMessage failed: ${body.error ?? "unknown error"}`);
  }
}
