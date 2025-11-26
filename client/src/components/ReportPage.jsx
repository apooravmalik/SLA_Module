// src/components/ReportPage.jsx (FIXED ERROR HANDLING)
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar'; 
import { FaDownload, FaArrowLeft } from 'react-icons/fa';
import { format, sub, startOfDay, startOfWeek, startOfMonth } from 'date-fns';

// --- Utility: Table Component ---
const TableComponent = ({ data, columns }) => {
    if (!data || data.length === 0) {
        return <p className="text-gray-500 p-4">No report data found for the current filters.</p>;
    }
    
    const columnHeaders = columns.map(col => ({ 
        key: col.key, 
        header: col.header, 
        width: col.width || 'auto' 
    }));
    
    return (
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
            <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                        <tr>
                            {columnHeaders.map(col => (
                                <th key={col.key} scope="col" className="px-6 py-3" style={{ minWidth: col.width }}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, rowIndex) => (
                            <tr key={rowIndex} className="bg-white border-b hover:bg-gray-50">
                                {columnHeaders.map(col => {
                                    const cellValue = row[col.key] !== null && row[col.key] !== undefined ? row[col.key] : 'N/A';
                                    let displayValue = cellValue.toString();
                                    
                                    if (col.key === 'PenaltyAmount' && cellValue !== 'N/A') {
                                        displayValue = `£ ${parseFloat(cellValue).toFixed(2)}`;
                                    } else if (col.key.endsWith('Time') && cellValue !== 'N/A') {
                                        try {
                                            displayValue = new Date(cellValue).toLocaleString();
                                        } catch (e) {
                                            displayValue = cellValue;
                                        }
                                    }
                                    
                                    return (
                                        <td key={col.key} className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                                            {displayValue}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 
const REPORT_URL = `${API_BASE_URL}/report/`;
const DOWNLOAD_URL = `${API_BASE_URL}/report/download`;

const reportColumns = [
    { header: 'NVR Alias', key: 'nvrAlias_TXT', width: '150px' },
    { header: 'Camera Name', key: 'camName_TXT', width: '150px' },
    { header: 'Zone', key: 'ZoneName' },
    { header: 'Street', key: 'StreetName' },
    { header: 'Unit', key: 'UnitName' },
    { header: 'Offline Time', key: 'OfflineTime', width: '180px' },
    { header: 'Online Time', key: 'OnlineTime', width: '180px' },
    { header: 'Offline Minutes', key: 'OfflineMinutes' },
    { header: 'Penalty', key: 'PenaltyAmount', width: '100px' },
];

const timelineOptions = [
    { value: 'day', label: 'Last 24 Hours' },
    { value: 'week', label: 'Last 7 Days' },
    { value: 'month', label: 'Last 30 Days' },
];

// Helper function to format error messages
const formatErrorMessage = (errorData) => {
    if (typeof errorData === 'string') {
        return errorData;
    }
    
    if (errorData.detail) {
        // Check if detail is an array of validation errors (422 response)
        if (Array.isArray(errorData.detail)) {
            return errorData.detail
                .map(err => `${err.loc?.join('.')}: ${err.msg}`)
                .join('; ');
        }
        // If detail is a string
        if (typeof errorData.detail === 'string') {
            return errorData.detail;
        }
    }
    
    return 'An unknown error occurred';
};

const ReportPage = ({ onGoToDashboard, onLogout }) => {
    const [filters, setFilters] = useState({});
    const [reportData, setReportData] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    const [loading, setLoading] = useState(false);
    const [globalError, setGlobalError] = useState(null);
    const [activeTimeline, setActiveTimeline] = useState('day');
    const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);

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

    // --- Date Filtering Logic ---
    const calculateDateRange = useCallback((timeline) => {
        const now = new Date();
        let startDate;
        
        if (timeline === 'day') {
            startDate = sub(now, { hours: 24 });
        } else if (timeline === 'week') {
            startDate = startOfWeek(sub(now, { weeks: 1 }), { weekStartsOn: 1 });
        } else if (timeline === 'month') {
            startDate = startOfMonth(sub(now, { months: 1 }));
        }
        
        return {
            date_from: startDate ? startDate.toISOString() : '',
            date_to: now.toISOString(),
        };
    }, []);

    const handleTimelineChange = useCallback((timeline) => {
        setActiveTimeline(timeline);
        if (timeline) {
            const dateRange = calculateDateRange(timeline);
            setFilters(prev => ({ ...prev, ...dateRange }));
        } else {
            setFilters(prev => {
                const { date_from, date_to, ...rest } = prev;
                return rest;
            });
        }
    }, [calculateDateRange]);
    
    // Initial load: Set default filter to 'day'
    useEffect(() => {
        handleTimelineChange('day');
    }, [handleTimelineChange]);

    // --- Data Fetching ---
    const fetchReportData = useCallback(async (currentFilters) => {
        setLoading(true);
        setGlobalError(null);
        
        const token = localStorage.getItem('token');
        if (!token) {
            setGlobalError("Authentication required. Please log in.");
            setLoading(false);
            return;
        }

        const queryString = filtersToQueryString(currentFilters);
        
        console.log("REPORT API Request (Filters):", currentFilters);
        console.log("REPORT API Request (Query String):", queryString);
        
        try {
            const response = await fetch(`${REPORT_URL}?${queryString}`, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setReportData(data.data || []);
                setTotalRows(data.total_rows || 0);
            } else {
                // FIXED: Properly handle error responses
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = formatErrorMessage(errorData);
                
                if (response.status === 403) {
                    setGlobalError("Access Denied: You do not have the required permissions.");
                } else if (response.status === 422) {
                    setGlobalError(`Validation Error: ${errorMessage}`);
                } else {
                    setGlobalError(errorMessage || `Failed to load report data (Status: ${response.status})`);
                }
            }
        } catch (error) {
            setGlobalError('Network error while fetching report data.');
            console.error('Report fetch error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (Object.keys(filters).length > 0) {
            fetchReportData(filters);
        }
    }, [filters, fetchReportData]);

    // --- Download Logic ---
    const handleDownload = async (format) => {
        setDownloadDropdownOpen(false);
        setLoading(true);
        setGlobalError(null);
        
        const token = localStorage.getItem('token');
        if (!token) {
            setGlobalError("Authentication required. Please log in.");
            setLoading(false);
            return;
        }
        
        const queryString = filtersToQueryString(filters);
        const downloadUrl = `${DOWNLOAD_URL}?${queryString}`;

        try {
            const response = await fetch(downloadUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'sla_report.csv'; 
                
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="(.+)"/);
                    if (match) filename = match[1];
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                const errorData = await response.text();
                setGlobalError(`Download failed: ${response.status} - ${errorData}`);
            }
        } catch (error) {
            setGlobalError('Network error during file download.');
            console.error('Download error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-poppins">
            
            {/* Navbar and Filters */}
            <Navbar onFilterChange={setFilters} onLogout={onLogout} currentFilters={filters} />

            <div className="mt-6 flex justify-between items-center pb-4 border-b">
                <div className="flex items-center space-x-4">
                    
                    {/* Back to Dashboard Button */}
                    <button 
                        onClick={onGoToDashboard} 
                        className="py-2 px-4 border border-gray-300 rounded-lg shadow-md text-gray-700 font-semibold bg-white hover:bg-gray-100 transition duration-150 flex items-center space-x-2"
                    >
                        <FaArrowLeft />
                        <span>Back to Dashboard</span>
                    </button>
                    
                    <h2 className="text-xl font-bold text-gray-700">Report Page</h2>
                </div>
                
                {/* Total Rows Indicator */}
                <span className="text-md text-gray-600">
                    Total Rows: {loading ? '...' : totalRows.toLocaleString()}
                </span>
            </div>

            {/* Timeline / Download Bar */}
            <div className="flex justify-start space-x-4 mt-4">
                
                {/* Timeline Dropdown */}
                <select 
                    value={activeTimeline}
                    onChange={(e) => handleTimelineChange(e.target.value)}
                    className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 border border-gray-300 cursor-pointer transition duration-150"
                >
                    <option value="">Timeline (Custom)</option>
                    {timelineOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                
                {/* Download Dropdown */}
                <div className="relative">
                    <button 
                        onClick={() => setDownloadDropdownOpen(!downloadDropdownOpen)}
                        className="py-2 px-4 bg-[#00BFFF] text-white rounded-lg hover:bg-sky-600 flex items-center space-x-2 transition duration-150"
                        disabled={loading || reportData.length === 0}
                    >
                        <span>Download</span>
                        <FaDownload />
                    </button>
                    {downloadDropdownOpen && (
                        <div className="absolute left-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-20">
                            <button 
                                onClick={() => handleDownload('CSV')} 
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition duration-150 rounded-t-lg"
                                disabled={loading || reportData.length === 0}
                            >
                                Download CSV
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Error Display - FIXED to handle objects properly */}
            {globalError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative my-4" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{globalError}</span>
                </div>
            )}

            {/* Table Component */}
            <div className="mt-6">
                {loading ? (
                    <div className="text-center py-12 text-[#00BFFF]">
                        <svg className="animate-spin h-8 w-8 text-[#00BFFF] inline-block mr-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading detailed report...
                    </div>
                ) : (
                    <TableComponent data={reportData} columns={reportColumns} />
                )}
            </div>
        </div>
    );
};

export default ReportPage;