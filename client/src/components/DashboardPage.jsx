// src/components/DashboardPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar'; 
import { FaMapMarkerAlt, FaRoad, FaBuilding, FaExclamationTriangle, FaCheckCircle, FaMoneyBill } from 'react-icons/fa';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://172.168.1.15:8001/api'; 
const DASHBOARD_URL = `${API_BASE_URL}/dashboard/`;

// --- KPICard Component ---
const KPICard = ({ title, value, icon: Icon, isPenalty = false, isStatic = false, onClick, context }) => {
    
    // Logic: If penalty, keep white bg (or specific penalty bg). 
    // Otherwise use global panel bg.
    const bgClass = isPenalty ? 'bg-[var(--bg-panel)]' : 'bg-[var(--bg-panel)]';
    const borderClass = isPenalty ? 'border-orange-400' : 'border-[var(--border-main)]';
    const textClass = isPenalty ? 'text-orange-600' : 'text-[#00BFFF]';
    const shadowClass = isPenalty ? 'shadow-lg' : 'shadow-md';

    const cardClass = `${bgClass} border ${borderClass} ${textClass} ${shadowClass}`;
    
    const displayValue = isStatic ? value.toLocaleString() : value.toLocaleString('en-US', {
        minimumFractionDigits: isPenalty ? 2 : 0,
        maximumFractionDigits: isPenalty ? 2 : 0,
    });

    return (
        <div 
            onClick={() => onClick(context)}
            role="button" 
            className={`p-6 rounded-xl transition duration-300 ease-in-out hover:shadow-xl cursor-pointer flex flex-col justify-between ${cardClass}`}
        >
            <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-full ${isPenalty ? 'bg-orange-100' : 'bg-sky-100'}`}> 
                    <Icon className={`w-6 h-6 ${isPenalty ? 'text-orange-500' : 'text-[#00BFFF]'}`} />
                </div>
                <h3 className="text-sm font-medium uppercase text-[var(--text-muted)]">{title}</h3>
            </div>
            <div className="mt-4 text-3xl font-extrabold text-[var(--dashboard-main)]">
                {isPenalty && '₹'} {displayValue}
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{isStatic ? 'Total System Count' : 'Filtered Data'}</p>
        </div>
    );
};

// --- DashboardPage Component ---
const DashboardPage = ({ onLogout, onGoToReport, onGoToMasterData, theme, toggleTheme }) => { 
    const [filters, setFilters] = useState({});
    const [kpiData, setKpiData] = useState({ 
        total_zones: 0, 
        total_streets: 0, 
        total_units: 0, 
        total_open_incidents: 0, 
        total_closed_incidents: 0, 
        total_penalty: '0.00', 
        error_details: {}
    });
    const [loading, setLoading] = useState(false);
    const [globalError, setGlobalError] = useState(null);

    const filtersToQueryString = (filters) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== "") {
                if (Array.isArray(value)) {
                    value.forEach(id => params.append(key, String(id)));
                } else if (value instanceof Date) {
                    params.append(key, value.toISOString());
                } else {
                    params.append(key, String(value));
                }
            }
        });
        return params.toString();
    };

    const fetchDashboardData = useCallback(async (currentFilters) => {
        setLoading(true);
        setGlobalError(null);
        
        const token = localStorage.getItem('token');
        if (!token) {
            setGlobalError("Authentication required. Please log in.");
            setLoading(false);
            return;
        }

        const queryString = filtersToQueryString(currentFilters);
        
        try {
            const response = await fetch(`${DASHBOARD_URL}?${queryString}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setKpiData(data);
                if (Object.keys(data.error_details).length > 0) {
                    console.warn("Partial data error:", data.error_details);
                    setGlobalError("Warning: Some KPI calculations failed. Check error details.");
                }
            } else {
                const errorResponse = await response.json().catch(() => ({}));
                let errorString = `Failed to load dashboard data. Status: ${response.status}.`;
                if (errorResponse.detail) {
                   errorString = typeof errorResponse.detail === 'string' ? errorResponse.detail : 'Validation Errors';
                }
                setGlobalError(errorString);
            }
        } catch (error) {
            setGlobalError('Network error while fetching dashboard data.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleApplyFilters = useCallback((newFilters) => {
        setFilters(newFilters);
        fetchDashboardData(newFilters);
    }, [fetchDashboardData]);

    useEffect(() => {
        fetchDashboardData(filters);
    }, [fetchDashboardData]);

    return (
        <div className="min-h-screen bg-[var(--bg-app)] p-6 font-poppins transition-colors duration-300">
		
			<h1 className="text-3xl font-extrabold text-[#00BFFF] mb-4">
                SLA MODULE - PKG 2 - DASHBOARD
            </h1>
            
            <Navbar 
                onApplyFilters={handleApplyFilters} 
                onLogout={onLogout} 
                currentFilters={filters}
                theme={theme}
                toggleTheme={toggleTheme}
            />

            {globalError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Error:</strong>
                    <span className="block sm:inline ml-2">{globalError}</span>
                </div>
            )}
            
            {loading && (
                <div className="text-center py-12 text-[#00BFFF]">
                    <svg className="animate-spin h-8 w-8 text-[#00BFFF] inline-block mr-3" viewBox="0 0 24 24"></svg>
                    Loading KPIs...
                </div>
            )}

            {!loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 pt-5 lg:grid-cols-3 gap-6">
                    <KPICard 
                        title="Total Constituencies" value={kpiData.total_zones} icon={FaMapMarkerAlt} isStatic={true} 
                        onClick={onGoToMasterData} 
                        context={{ type: 'zone', subtype: 'zone', title: 'All Constituencies' }} 
                    />
                    <KPICard 
                        title="Total RWAs" value={kpiData.total_streets} icon={FaRoad} isStatic={true} 
                        onClick={onGoToMasterData} 
                        context={{ type: 'street', subtype: 'street', title: 'All RWAs' }} 
                    />
                    <KPICard 
                        title="Total Packages" value={kpiData.total_units} icon={FaBuilding} isStatic={true} 
                        onClick={onGoToMasterData} 
                        context={{ type: 'unit', subtype: 'unit', title: 'All Packages' }} 
                    />
                    <KPICard 
                        title="Total Open Incidents" value={kpiData.total_open_incidents} icon={FaExclamationTriangle} 
                        onClick={onGoToMasterData} 
                        context={{ type: 'incident', subtype: 'incident_open', status: 1, filters: filters }} 
                    />
                    <KPICard 
                        title="Total Closed Incidents" value={kpiData.total_closed_incidents} icon={FaCheckCircle} 
                        onClick={onGoToMasterData} 
                        context={{ type: 'incident', subtype: 'incident_closed', status: 2, filters: filters }} 
                    />
                    <KPICard 
                        title="Penalty Calculation" value={kpiData.total_penalty} icon={FaMoneyBill} isPenalty={true} 
                        onClick={onGoToReport} 
                        context={{ type: 'dynamic', incidentStatus: 'penalty', filters: filters }} 
                    />
                </div>
            )}
        </div>
    );
};

export default DashboardPage;