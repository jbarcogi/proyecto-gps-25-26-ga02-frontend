// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './hooks/useAuth.jsx' // NUEVO IMPORT

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <AuthProvider> {/* ENVOLVER LA APP CON EL PROVIDER */}
            <App />
        </AuthProvider>
    </React.StrictMode>,
)