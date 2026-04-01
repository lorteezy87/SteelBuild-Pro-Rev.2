const APP_ID = "69c68aaf23533aadb23e1857";
const PROJECT_ENTITY_BASE = `/api/apps/${APP_ID}/entities/Project`;

function getApiKey() {
  try {
    return (
      window.localStorage.getItem("base44_api_key") ||
      window.localStorage.getItem("api_key") ||
      ""
    );
  } catch {
    return "";
  }
}

function buildHeaders() {
  const apiKey = getApiKey();
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { api_key: apiKey } : {}),
  };
}

function toQueryString(filters = {}) {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  const params = new URLSearchParams();
  entries.forEach(([k, v]) => params.append(k, String(v)));
  return `?${params.toString()}`;
}

export async function fetchProjectEntities(filters = {}) {
  const response = await fetch(`${PROJECT_ENTITY_BASE}${toQueryString(filters)}`, {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch projects (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

export async function updateProjectEntity(entityId, updateData) {
  if (!entityId) {
    throw new Error("entityId is required to update a Project entity.");
  }

  const response = await fetch(`${PROJECT_ENTITY_BASE}/${entityId}`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify(updateData || {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update project ${entityId} (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

