// src/App.jsx
import React, { useState } from 'react'; 
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import ReportPage from './components/ReportPage';

// Function to safely check initial login state from localStorage
const getInitialLoginState = () => {
    // Returns true if a token exists in localStorage, false otherwise.
    return !!localStorage.getItem('token'); 
};

function App() {
    // 1. Authentication State: Checked once on load
    const [isLoggedIn, setIsLoggedIn] = useState(getInitialLoginState); 
    
    // 2. Routing State: Controls which major view is displayed
    const [currentPage, setCurrentPage] = useState('dashboard'); 

    // --- Authentication Handlers ---
    
    // Called by LoginPage on successful API response
    const handleLogin = (token) => {
        localStorage.setItem('token', token);
        setIsLoggedIn(true);
        setCurrentPage('dashboard'); // Redirect to dashboard after login
    };

    // Called by DashboardPage or ReportPage logout button
    const handleLogout = () => {
        // 1. Clear token from client storage
        localStorage.removeItem('token');
        // 2. Reset state
        setIsLoggedIn(false);
        setCurrentPage('dashboard'); // Reset view to default (which will show LoginPage)
    };
    
    // --- Routing Handlers ---
    
    // Called by KPICards on DashboardPage
    const goToReport = () => setCurrentPage('report');
    
    // Called by the "Back to Dashboard" button on ReportPage
    const goToDashboard = () => setCurrentPage('dashboard');

    // --- Conditional Rendering Logic ---
    const renderContent = () => {
        if (!isLoggedIn) {
            // Show Login Page if not authenticated
            return <LoginPage onLoginSuccess={handleLogin} />;
        }

        if (currentPage === 'report') {
            // Show Report Page
            return <ReportPage 
                        onGoToDashboard={goToDashboard} 
                        onLogout={handleLogout} 
                   />;
        }
        
        // Default: Show Dashboard Page
        return <DashboardPage 
                    onLogout={handleLogout} 
                    onGoToReport={goToReport} 
               />;
    };

    return (
        <div className="App">
            {renderContent()}
        </div>
    );
}

export default App;