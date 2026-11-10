import axios from 'axios';

const api = axios.create({
    // Cambia esto por la URL local de tu API en Laragon (ej: http://api-kiopos.test/api o http://localhost/api-kiopos/public/api)
    baseURL: 'https://kiopos.tortuga-veloz.com/api', 
    //baseURL: 'http://127.0.0.1:8000/api', 
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// Interceptor opcional: Inyectar automáticamente el token de Passport si el usuario está logueado
api.interceptors.request.use(config => {
    const token = localStorage.getItem('kiopos_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => {
    return Promise.reject(error);
});

export default api;