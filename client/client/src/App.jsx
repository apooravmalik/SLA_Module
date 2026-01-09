// client/src/App.jsx
import React, { useState } from 'react'; 
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import ReportPage from './components/ReportPage';
import MasterDataPage from './components/MasterDataPage'; // NEW IMPORT

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
    
    // 3. Contextual data for navigation (SLA report only)
    const [reportContext, setReportContext] = useState(null); 
    
    // 4. NEW STATE: Contextual data for Master Data pages
    const [masterContext, setMasterContext] = useState(null);

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
        setReportContext(null); // Clear context on logout
        setMasterContext(null); // Clear master context on logout
    };
    
    // --- Routing Handlers ---
    
    // Function to navigate to SLA Report (Penalty)
    const goToReport = (context = null) => {
        setReportContext(context);
        setMasterContext(null);
        setCurrentPage('report');
    }
    
    // UPDATED: To navigate to Master Data Details (Static/Incident KPIs)
    const goToMasterData = (context) => {
        setMasterContext(context);
        setReportContext(null);
        setCurrentPage('master-data');
    }
    
    // Called by the "Back to Dashboard" button on ReportPage/MasterDataPage
    const goToDashboard = () => {
        setCurrentPage('dashboard');
        setReportContext(null);
        setMasterContext(null);
    }

    // --- Conditional Rendering Logic ---
    const renderContent = () => {
        if (!isLoggedIn) {
            // Show Login Page if not authenticated
            return <LoginPage onLoginSuccess={handleLogin} />;
        }
        
        if (currentPage === 'master-data') { // Handles Static and Incident KPI clicks
            return <MasterDataPage 
                        masterContext={masterContext} // Pass context
                        onGoToDashboard={goToDashboard} 
                        onLogout={handleLogout} 
                   />;
        }

        if (currentPage === 'report') {
            // Show Report Page
            return <ReportPage 
                        onGoToDashboard={goToDashboard} 
                        onLogout={handleLogout} 
                        reportContext={reportContext} 
                   />;
        }
        
        // Default: Show Dashboard Page
        return <DashboardPage 
                    onLogout={handleLogout} 
                    onGoToReport={goToReport} 
                    onGoToMasterData={goToMasterData} // NEW PROP
               />;
    };

    return (
        <div className="App">
            {renderContent()}
        </div>
    );
}

export default App;