import React, { useState, useEffect } from 'react'; 
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import ReportPage from './components/ReportPage';
import MasterDataPage from './components/MasterDataPage'; 

const getInitialLoginState = () => !!localStorage.getItem('token');

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(getInitialLoginState); 
    const [currentPage, setCurrentPage] = useState('dashboard'); 
    const [reportContext, setReportContext] = useState(null); 
    const [masterContext, setMasterContext] = useState(null);

    // Theme State Management
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

    useEffect(() => {
        // Apply the theme to the root HTML element
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    const handleLogin = (token) => {
        localStorage.setItem('token', token);
        setIsLoggedIn(true);
        setCurrentPage('dashboard'); 
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setCurrentPage('dashboard'); 
        setReportContext(null); 
        setMasterContext(null); 
    };
    
    const goToReport = (context = null) => {
        setReportContext(context);
        setMasterContext(null);
        setCurrentPage('report');
    }
    
    const goToMasterData = (context) => {
        setMasterContext(context);
        setReportContext(null);
        setCurrentPage('master-data');
    }
    
    const goToDashboard = () => {
        setCurrentPage('dashboard');
        setReportContext(null);
        setMasterContext(null);
    }

    const renderContent = () => {
        if (!isLoggedIn) {
            return <LoginPage 
                        onLoginSuccess={handleLogin} 
                        theme={theme} 
                        toggleTheme={toggleTheme}
                    />;
        }
        
        if (currentPage === 'master-data') { 
            return <MasterDataPage 
                        masterContext={masterContext} 
                        onGoToDashboard={goToDashboard} 
                        onLogout={handleLogout}
                        theme={theme}
                        toggleTheme={toggleTheme}
                   />;
        }

        if (currentPage === 'report') {
            return <ReportPage 
                        onGoToDashboard={goToDashboard} 
                        onLogout={handleLogout} 
                        reportContext={reportContext}
                        theme={theme}
                        toggleTheme={toggleTheme} 
                   />;
        }
        
        return <DashboardPage 
                    onLogout={handleLogout} 
                    onGoToReport={goToReport} 
                    onGoToMasterData={goToMasterData}
                    theme={theme}
                    toggleTheme={toggleTheme}
               />;
    };

    return (
        <div className="App transition-colors duration-300">
            {renderContent()}
        </div>
    );
}

export default App;