import axios from "axios";

const API = axios.create({
   //baseURL: "https://nummular-unexpectingly-rebekah.ngrok-free.dev/api",
  baseURL: "http://localhost:5000/api/", // backend URL
      timeout: 10000,

});

// Add an interceptor to attach token automatically
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token"); // grab token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default API;