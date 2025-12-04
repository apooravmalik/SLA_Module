// src/components/DashboardPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar'; 
import { FaMapMarkerAlt, FaRoad, FaBuilding, FaExclamationTriangle, FaCheckCircle, FaMoneyBill } from 'react-icons/fa';

// Literal Sky Blue Color (Arbitrary value syntax)
const SKY_BLUE = '#00BFFF'; 

// Base URL from environment (Vite must be configured for this)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 
const DASHBOARD_URL = `${API_BASE_URL}/dashboard/`;

// --- KPICard Component ---
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
                {isPenalty && '₹'} {displayValue}
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

    // Helper to convert complex filters (including array IDs) to URL query string
    const filtersToQueryString = (filters) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== "") {
                if (Array.isArray(value)) {
                    // For multi-select: append each ID separately (e.g., zone_id=1&zone_id=2)
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

    // Callback to fetch data from the backend
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
        
        // Debugging: Log API Request
        console.log("DASHBOARD API Request (Filters):", currentFilters); 
        console.log("DASHBOARD API Request (Query String):", queryString); 
        
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
                // --- FIX: Robust Error Handling for 422 and other errors ---
                const errorResponse = await response.json().catch(() => ({}));
                
                let errorString = `Failed to load dashboard data. Status: ${response.status}.`;
                
                if (errorResponse.detail) {
                    if (Array.isArray(errorResponse.detail)) {
                        // Handle the array of Pydantic validation errors (which crashed React previously)
                        errorString = 'Validation Errors: ' + errorResponse.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join('; ');
                    } else if (typeof errorResponse.detail === 'string') {
                        errorString = errorResponse.detail;
                    }
                }
                
                setGlobalError(errorString);
            }
        } catch (error) {
            setGlobalError('Network error while fetching dashboard data.');
        } finally {
            setLoading(false);
        }
    }, []);

    // NEW: Handler for the 'Go' button click from Navbar
    const handleApplyFilters = useCallback((newFilters) => {
        // 1. Update the applied filters state
        setFilters(newFilters);
        // 2. Trigger the fetch with the new filters
        fetchDashboardData(newFilters);
    }, [fetchDashboardData]);

    // Effect hook to trigger data fetching only on mount for the default filters (backend's default date range).
    // Subsequent fetches are triggered manually by handleApplyFilters/Go button.
    useEffect(() => {
        // Initial load will use the default filter state (empty object), 
        // relying on the backend to apply its default date range (previous month).
        fetchDashboardData(filters);
    }, []); // Only runs once on mount.

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-poppins">
		
			<h1 className="text-3xl font-extrabold text-[#00BFFF] mb-4">
                SLA MODULE - PKG 2 - DASHBOARD
            </h1>
            
            {/* Navbar Component with Filters and Logout */}
            {/* onApplyFilters is the new handler for the Navbar's 'Go' button */}
            <Navbar onApplyFilters={handleApplyFilters} onLogout={onLogout} currentFilters={filters} />

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

            {/* KPI Grid (lg:grid-cols-3 layout) */}
            {!loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 pt-5 lg:grid-cols-3 gap-6">
                    
                    {/* First Row: Static KPIs */}
                    <KPICard title="Total Zones" value={kpiData.total_zones} icon={FaMapMarkerAlt} isStatic={true} onClick={onGoToReport} />
                    <KPICard title="Total Streets" value={kpiData.total_streets} icon={FaRoad} isStatic={true} onClick={onGoToReport} />
                    <KPICard title="Total Units" value={kpiData.total_units} icon={FaBuilding} isStatic={true} onClick={onGoToReport} />

                    {/* Second Row: Dynamic KPIs */}
                    <KPICard title="Total Open Incidents" value={kpiData.total_open_incidents} icon={FaExclamationTriangle} onClick={onGoToReport} />
                    <KPICard title="Total Closed Incidents" value={kpiData.total_closed_incidents} icon={FaCheckCircle} onClick={onGoToReport} />
                    
                    <KPICard title="Penalty Calculation" value={kpiData.total_penalty} icon={FaMoneyBill} isPenalty={true} onClick={onGoToReport} />
                </div>
            )}
        </div>
    );
};

export default DashboardPage;