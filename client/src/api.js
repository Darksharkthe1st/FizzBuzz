export async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    console.error("[api] JSON request failed.", {
      path,
      status: response.status,
      details,
    });
    throw new Error(details.error || details.message || `Request failed: ${response.status}`);
  }
  return response.json();
}
