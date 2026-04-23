import axios from 'axios';
import { auth } from '../config/firebase';
import { showNetworkToast } from './toast';

const api = axios.create({
  baseURL: `${process.env.EXPO_PUBLIC_API_URL}/api`,
});

api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) showNetworkToast();
    return Promise.reject(error);
  },
);

export default api;
