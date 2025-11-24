// src/components/DashboardPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar'; 
import { FaMapMarkerAlt, FaRoad, FaBuilding, FaExclamationTriangle, FaCheckCircle, FaMoneyBill, FaSignOutAlt } from 'react-icons/fa';

const SKY_BLUE = '#00BFFF'; 
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 
const DASHBOARD_URL = `${API_BASE_URL}/dashboard/`;

// --- KPICard Component ---
// Added onClick prop for redirection
const KPICard = ({ title, value, icon: Icon, isPenalty = false, isStatic = false, onClick }) => {
    // Using Tailwind arbitrary values (literals) for colors
    const cardClass = isPenalty
        ? 'bg-white border-2 border-orange-400 text-orange-600 shadow-lg'
        : 'bg-white border border-gray-200 text-[#00BFFF] shadow-md';
    
    const displayValue = isStatic ? value.toLocaleString() : value.toLocaleString('en-US', {
        minimumFractionDigits: isPenalty ? 2 : 0,
        maximumFractionDigits: isPenalty ? 2 : 0,
    });

    return (
        <div 
            onClick={onClick}
            role="button" 
            className={`p-6 rounded-xl transition duration-300 ease-in-out hover:shadow-xl cursor-pointer flex flex-col justify-between ${cardClass}`}
        >
            <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-full ${isPenalty ? 'bg-orange-100' : 'bg-sky-100'}`}> 
                    <Icon className={`w-6 h-6 ${isPenalty ? 'text-orange-500' : 'text-[#00BFFF]'}`} />
                </div>
                <h3 className="text-sm font-medium uppercase text-gray-500">{title}</h3>
            </div>
            <div className="mt-4 text-3xl font-extrabold">
                {isPenalty && '£'} {displayValue}
            </div>
            <p className="mt-1 text-xs text-gray-500">{isStatic ? 'Total System Count' : 'Filtered Data'}</p>
        </div>
    );
};

// --- DashboardPage Component ---
const DashboardPage = ({ onLogout, onGoToReport }) => { // Props added
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
                if (value instanceof Date) {
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
            } else if (response.status === 403) {
                 setGlobalError("Access Denied: You do not have the required role (Management).");
            } else {
                const errorData = await response.json();
                setGlobalError(errorData.detail || 'Failed to load dashboard data.');
            }
        } catch (error) {
            setGlobalError('Network error while fetching dashboard data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData(filters);
    }, [filters, fetchDashboardData]);

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-poppins">
            
            {/* Navbar Component with Filters and Logout */}
            <Navbar onFilterChange={setFilters} onLogout={onLogout} />

            <h2 className="text-xl font-bold text-gray-700 mt-6 mb-4">Dashboard Overview</h2>

            {/* Error Display */}
            {globalError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Error:</strong>
                    <span className="block sm:inline ml-2">{globalError}</span>
                </div>
            )}
            
            {/* Loading Indicator */}
            {loading && (
                <div className="text-center py-12 text-[#00BFFF]">
                    <svg className="animate-spin h-8 w-8 text-[#00BFFF] inline-block mr-3" viewBox="0 0 24 24"></svg>
                    Loading KPIs...
                </div>
            )}

            {/* KPI Grid (lg:grid-cols-3 fix applied) */}
            {!loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    
                    {/* All cards now call onGoToReport on click */}
                    <KPICard title="Total Zones" value={kpiData.total_zones} icon={FaMapMarkerAlt} isStatic={true} onClick={onGoToReport} />
                    <KPICard title="Total Streets" value={kpiData.total_streets} icon={FaRoad} isStatic={true} onClick={onGoToReport} />
                    <KPICard title="Total Units" value={kpiData.total_units} icon={FaBuilding} isStatic={true} onClick={onGoToReport} />

                    <KPICard title="Total Open Incidents" value={kpiData.total_open_incidents} icon={FaExclamationTriangle} onClick={onGoToReport} />
                    <KPICard title="Total Closed Incidents" value={kpiData.total_closed_incidents} icon={FaCheckCircle} onClick={onGoToReport} />
                    
                    <KPICard title="Penalty Calculation" value={kpiData.total_penalty} icon={FaMoneyBill} isPenalty={true} onClick={onGoToReport} />
                </div>
            )}
        </div>
    );
};

export default DashboardPage;