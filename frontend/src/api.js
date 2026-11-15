const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export async function api(path, options = {}) {
  const token = localStorage.getItem("cyber-report-token");
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Tidak dapat menghubungi backend di ${API_URL}. Jalankan API dari folder backend dengan: python -m uvicorn app.main:app --reload`,
      );
    }
    throw error;
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.detail === "string" ? body.detail : "Terjadi kesalahan. Silakan coba lagi.";
    throw new Error(message);
  }
  return body;
}

export function authHeaders() {
  const token = localStorage.getItem("cyber-report-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
