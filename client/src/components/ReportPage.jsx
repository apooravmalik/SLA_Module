// client/src/components/ReportPage.jsx (PAGINATION IMPLEMENTATION)
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './Navbar'; 
import { FaDownload, FaArrowLeft } from 'react-icons/fa';
import { sub } from 'date-fns';

// ------------------------------------------------------------------
// Base Configuration
// ------------------------------------------------------------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 
const REPORT_URL = `${API_BASE_URL}/report/`;
const DOWNLOAD_URL = `${API_BASE_URL}/report/download`;
const PAGE_LIMIT = 500; // Define the fixed page size

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
        if (Array.isArray(errorData.detail)) {
            return errorData.detail
                .map(err => `${err.loc?.join('.')}: ${err.msg}`)
                .join('; ');
        }
        if (typeof errorData.detail === 'string') {
            return errorData.detail;
        }
    }
    
    return 'An unknown error occurred';
};


// ------------------------------------------------------------------
// Table Component (In-line rendering with forwardRef for scroll access)
// ------------------------------------------------------------------
const TableContent = React.forwardRef(({ data, columns }, ref) => {
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
            {/* Scrollable container for infinite loading */}
            <div ref={ref} className="max-h-[70vh] overflow-y-auto"> 
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
                                        displayValue = `₹ ${parseFloat(cellValue).toFixed(2)}`;
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
});


const ReportPage = ({ onGoToDashboard, onLogout }) => {
    // State to hold the filters currently applied to the report data
    const [appliedFilters, setAppliedFilters] = useState({});
    const [reportData, setReportData] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    
    // Pagination State
    const [skip, setSkip] = useState(0); 
    const [hasMore, setHasMore] = useState(true);
    
    // Loading States
    const [loadingInitial, setLoadingInitial] = useState(false); // For first load
    const [loadingMore, setLoadingMore] = useState(false);     // For subsequent pages
    const [globalError, setGlobalError] = useState(null);
    const [activeTimeline, setActiveTimeline] = useState('month'); // Default is now 'month'
    const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);
    
    // Ref to the scrollable table container
    const scrollContainerRef = useRef(null);

    // Helper to convert filters (including date/pagination) to query string
    const filtersToQueryString = (currentFilters, currentSkip) => {
        const params = new URLSearchParams();

        Object.entries(currentFilters).forEach(([key, value]) => {
            // Exclude skip/limit fields from filters object 
            if (value === null || value === undefined || value === "" || key === 'skip' || key === 'limit') return;

            if (Array.isArray(value)) {
                value.forEach(id => params.append(key, String(id)));
            } 
            else if (value instanceof Date) {
                params.append(key, value.toISOString());
            } 
            else {
                params.append(key, String(value));
            }
        });

        // Add pagination params explicitly
        params.append('skip', currentSkip);
        params.append('limit', PAGE_LIMIT);

        return params.toString();
    };

    // --- Date Filtering Logic (Remains the same) ---
    const calculateDateRange = useCallback((timeline) => {
        const now = new Date();
        let startDate;

        if (timeline === 'day') {
            startDate = sub(now, { hours: 24 });
        } 
        else if (timeline === 'week') {
            startDate = sub(now, { weeks: 1 });
        } 
        else if (timeline === 'month') {
            startDate = sub(now, { months: 1 });
        }

        // Return dates as ISO strings (which the backend will convert to datetime objects)
        return {
            date_from: startDate ? startDate.toISOString().split('T')[0] : '', // Keep only date part
            date_to: now.toISOString().split('T')[0],
        };
    }, []);

    const handleTimelineChange = useCallback((timeline) => {
        setActiveTimeline(timeline);

        let newDateFilters = {};
        if (timeline !== "" && timeline !== null) {
            newDateFilters = calculateDateRange(timeline);
        }

        // Reset data and pagination state whenever filters change (new query)
        setReportData([]);
        setSkip(0);
        setHasMore(true);

        setFilters(prev => ({ 
            ...prev, 
            ...newDateFilters, 
            date_from: newDateFilters.date_from || '',
            date_to: newDateFilters.date_to || ''
        }));

    }, [calculateDateRange]);
    
    // Initial load: Set default filter to 'month'
    useEffect(() => {
        if (Object.keys(filters).length === 0) { 
            handleTimelineChange('month'); 
        }
    }, [filters, handleTimelineChange]);


    // --- Data Fetching (PAGINATED) ---
    // isNewFilter = true for initial load or filter change, false for infinite scroll
    const fetchReportData = useCallback(async (currentFilters, currentSkip, isNewFilter = true) => {
        
        if (!hasMore && !isNewFilter) return; 
        
        if (isNewFilter) {
            setLoadingInitial(true);
            setReportData([]);
            setSkip(0);
        } else {
            setLoadingMore(true);
        }
        setGlobalError(null);
        
        const token = localStorage.getItem('token');
        if (!token) {
            setGlobalError("Authentication required. Please log in.");
            setLoadingInitial(false);
            setLoadingMore(false);
            return;
        }

        const queryString = filtersToQueryString(currentFilters, currentSkip);
        
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
                
                // Update or append data
                if (isNewFilter) {
                    setReportData(data.data || []);
                } else {
                    setReportData(prevData => [...prevData, ...(data.data || [])]);
                }
                
                setTotalRows(data.total_rows || 0);

                // Check for 'hasMore': if we fetched less than the limit, we're at the end.
                const fetchedCount = data.data ? data.data.length : 0;
                setHasMore(fetchedCount === PAGE_LIMIT);
                
                // Update skip for the *next* request
                if (fetchedCount > 0) {
                    setSkip(currentSkip + fetchedCount);
                }

            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = formatErrorMessage(errorData);
                setGlobalError(errorMessage || `Failed to load report data (Status: ${response.status})`);
            }
        } catch (error) {
            setGlobalError('Network error while fetching report data.');
            console.error('Report fetch error:', error);
        } finally {
            setLoadingInitial(false);
            setLoadingMore(false);
        }
    }, [hasMore, PAGE_LIMIT]); 

    // Effect hook to trigger the initial fetch or a fetch on filter/date change
    useEffect(() => {
        // Trigger initial fetch (skip=0) if filters exist
        if (Object.keys(filters).length > 0) {
            fetchReportData(filters, 0, true);
        }
    }, [filters]); 

    // --- Infinite Scroll Handler ---
    const handleScroll = useCallback(() => {
        const element = scrollContainerRef.current;
        
        if (element && hasMore && !loadingInitial && !loadingMore) {
            // Check if user has scrolled near the bottom (e.g., within 100px of the end)
            const isNearBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;

            if (isNearBottom) {
                console.log(`Scrolling to fetch next page (skip: ${skip})`);
                fetchReportData(filters, skip, false);
            }
        }
    }, [filters, skip, hasMore, loadingInitial, loadingMore, fetchReportData]);


    // Attach scroll listener
    useEffect(() => {
        const element = scrollContainerRef.current;
        if (element) {
            element.addEventListener('scroll', handleScroll);
            return () => element.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    // --- Download Logic (Excludes pagination parameters) ---
    const handleDownload = async (format) => {
        setDownloadDropdownOpen(false);
        const token = localStorage.getItem('token');
        if (!token) return setGlobalError("Authentication required. Please log in.");
        
        // Use an empty skip/limit value to ensure the backend fetches ALL data for download
        const queryFilters = { 
            zone_id: filters.zone_id, 
            street_id: filters.street_id, 
            unit_id: filters.unit_id, 
            date_from: filters.date_from, 
            date_to: filters.date_to,
        };
        // The download route calls the original GET route, which will pass 0/500 if not explicitly passed here.
        // It's safer to rely on the backend's default behavior for the download route (which should be full fetch). 
        // We ensure we only pass the filter values, not the current pagination state.
        const queryString = filtersToQueryString(queryFilters, 0); // Pass skip=0 and limit=500 for the final conversion, though the endpoint may ignore them.
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
            setLoadingInitial(false); 
        }
    };
    

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-poppins">
            
            {/* NEW HEADING: Above Navbar */}
            <h1 className="text-3xl font-extrabold text-[#00BFFF] mb-4 text-center">
                SLA MODULE - PKG 2 - REPORT
            </h1>

            {/* Navbar and Filters */}
            {/* Renamed onFilterChange to onApplyFilters, passed appliedFilters for state sync */}
            <Navbar onApplyFilters={handleApplyFilters} onLogout={onLogout} currentFilters={appliedFilters} />

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
                    
                    <h2 className="text-xl font-bold text-gray-700">Report Page (Pagination: {PAGE_LIMIT} records)</h2>
                </div>
                
                {/* Total Rows Indicator */}
                <span className="text-md text-gray-600">
                    Total Rows (Filtered): {loadingInitial ? '...' : totalRows.toLocaleString()}
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
                        disabled={loadingInitial || reportData.length === 0}
                    >
                        {isDownloading ? ( 
                            <>
                                <FaSpinner className="animate-spin" />
                                <span>Generating...</span>
                            </>
                        ) : (
                            <>
                                <span>Download</span>
                                <FaDownload />
                            </>
                        )}
                    </button>
                    {downloadDropdownOpen && (
                        <div className="absolute left-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-20">
                            <button 
                                onClick={() => handleDownload('CSV')} 
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition duration-150 rounded-t-lg"
                                disabled={loadingInitial || reportData.length === 0}
                            >
                                Download CSV
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Error Display */}
            {globalError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative my-4" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{globalError}</span>
                </div>
            )}

            {/* Table Component */}
            <div className="mt-6">
                
                {loadingInitial ? (
                    <div className="text-center py-12 text-[#00BFFF]">
                        <svg className="animate-spin h-8 w-8 text-[#00BFFF] inline-block mr-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading detailed report...
                    </div>
                ) : (
                    <>
                        <TableContent data={reportData} columns={reportColumns} ref={scrollContainerRef} />
                        
                        {/* Infinite Scroll Loading Indicator */}
                        {loadingMore && (
                            <div className="text-center py-4 text-[#00BFFF]">
                                <svg className="animate-spin h-6 w-6 text-[#00BFFF] inline-block mr-2" viewBox="0 0 24 24"></svg>
                                Loading more data...
                            </div>
                        )}
                        
                        {/* End of results message */}
                        {!hasMore && reportData.length > 0 && !loadingMore && (
                            <div className="text-center py-4 text-gray-500 text-sm">
                                End of report data. ({reportData.length} of {totalRows.toLocaleString()} displayed)
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ReportPage;