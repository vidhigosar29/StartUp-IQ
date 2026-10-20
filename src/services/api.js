
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json"
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("startupIQToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const getSchemes = (params = {}) =>
  api.get("/schemes", { params });

export const getScheme = (slug) =>
  api.get(`/schemes/${encodeURIComponent(slug)}`);

export const compareSchemes = (slugs) =>
  api.get("/schemes/compare", {
    params: { slugs: slugs.join(",") }
  });

export const getStates = (params = {}) =>
  api.get("/states", { params });

export const getStateIncentives = (params = {}) =>
  api.get("/state-incentives", { params });

export const getIncubators = (params = {}) =>
  api.get("/incubators", { params });

export const getReference = (key) =>
  api.get(`/reference/${encodeURIComponent(key)}`);

export const getFinderQuestions = () =>
  api.get("/finder/questions");

export const getFinderResults = (answers) =>
  api.post("/finder/results", { answers });

export const getLifecycle = (params = {}) =>
  api.get("/lifecycle", { params });

export const getNeeds = (params = {}) =>
  api.get("/needs", { params });

export const globalSearch = (q) =>
  api.get("/search", { params: { q } });

export const signup = async (details) => {
  const response = await api.post("/auth/signup", details);




  if (response.data.token) {
    localStorage.setItem("startupIQToken", response.data.token);
  }

  return response;
};

export const login = async (credentials) => {
  const response = await api.post("/auth/login", credentials);

  if (response.data.token) {
    localStorage.setItem("startupIQToken", response.data.token);
  }

  return response;
};

export const logout = () => {
  localStorage.removeItem("startupIQToken");
};

export const getCurrentUser = () => api.get("/auth/me");

export const getSavedSchemes = () => api.get("/saved-schemes");

export const saveScheme = (slug) =>
  api.post("/saved-schemes", { slug });

export const removeSavedScheme = (schemeId) =>
  api.delete(`/saved-schemes/${encodeURIComponent(schemeId)}`);

export const getPreferences = () => api.get("/preferences");

export const updatePreferences = (preferences) =>
  api.put("/preferences", preferences);



export const getNeedsIndex = () => api.get("/needs-index");

export default api;
