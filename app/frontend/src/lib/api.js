// Thin client for the Node backend. The browser never contacts the ML service.

export async function fetchClasses() {
  const r = await fetch("/api/classes");
  if (!r.ok) throw new Error("Could not load class list.");
  return r.json(); // { names: { id: name } }
}

export async function predict(file) {
  const form = new FormData();
  form.append("image", file);

  let r;
  try {
    r = await fetch("/api/predict", { method: "POST", body: form });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  let data = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON error */
  }

  if (!r.ok) {
    throw new Error((data && data.error) || "Analysis failed. Please try again.");
  }
  return data;
}

export async function health() {
  try {
    const r = await fetch("/api/health");
    return r.json();
  } catch {
    return { backend: null };
  }
}
