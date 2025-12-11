// client/src/components/ReportPage.jsx (PAGINATION AND SORTING IMPLEMENTATION)
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'; // Added useMemo
import Navbar from './Navbar'; 
import { FaDownload, FaArrowLeft, FaSpinner, FaSortUp, FaSortDown } from 'react-icons/fa'; // ADDED FaSortUp, FaSortDown
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
    { header: 'Status', key: 'Status', width: '100px' }, // Status is now included
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
const TableContent = React.forwardRef(({ data, columns, sortConfig, onSort }, ref) => {
    if (!data || data.length === 0) {
        return <p className="text-gray-500 p-4">No report data found for the current filters.</p>;
    }
    
    const columnHeaders = columns.map(col => ({ 
        key: col.key, 
        header: col.header, 
        width: col.width || 'auto' 
    }));
    
    // Helper to render sort icon
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'ascending' 
            ? <FaSortUp className="w-3 h-3 ml-1" /> 
            : <FaSortDown className="w-3 h-3 ml-1" />;
    };

    return (
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
            {/* Scrollable container for infinite loading */}
            <div ref={ref} className="max-h-[70vh] overflow-y-auto"> 
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                        <tr>
                            {columnHeaders.map(col => (
                                <th 
                                    key={col.key} 
                                    scope="col" 
                                    className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                                    style={{ minWidth: col.width }}
                                    onClick={() => onSort(col.key)} // Handle sorting on click
                                >
                                    <div className="flex items-center">
                                        {col.header}
                                        {getSortIcon(col.key)}
                                    </div>
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
                                    } else if ((col.key.endsWith('Time') || col.key.endsWith('DTM')) && cellValue !== 'N/A') {
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


const ReportPage = ({ onGoToDashboard, onLogout, reportContext }) => { 
    // State to hold the filters currently applied to the report data
    const [appliedFilters, setAppliedFilters] = useState({});
    const [reportData, setReportData] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    
    // Pagination State
    const [skip, setSkip] = useState(0); 
    const [hasMore, setHasMore] = useState(true);

    // SORTING State: Default to sorting by IncidentLog_PRK descending, which is typical for reports.
    const [sortConfig, setSortConfig] = useState({ key: 'IncidentLog_PRK', direction: 'descending' }); 
    
    // Loading States
    const [loadingInitial, setLoadingInitial] = useState(false); 
    const [loadingMore, setLoadingMore] = useState(false);     
    const [globalError, setGlobalError] = useState(null);
    const [activeTimeline, setActiveTimeline] = useState('month'); 
    const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false); 
    
    // Ref to the scrollable table container
    const scrollContainerRef = useRef(null);

    // Helper to convert filters (including date/pagination) to query string
    const filtersToQueryString = useCallback((currentFilters, currentSkip, isDownload = false) => {
        const params = new URLSearchParams();

        Object.entries(currentFilters).forEach(([key, value]) => {
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

        // Add pagination params explicitly only if not downloading
        if (!isDownload) {
             params.append('skip', currentSkip);
             params.append('limit', PAGE_LIMIT);
        } // No need for else: download relies on backend's high limit

        return params.toString();
    }, []); 

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

        return {
            date_from: startDate ? startDate.toISOString().split('T')[0] : '', 
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
        // Do NOT reset sorting state here.

        setAppliedFilters(prev => ({ 
            ...prev, 
            ...newDateFilters, 
            date_from: newDateFilters.date_from || '',
            date_to: newDateFilters.date_to || ''
        }));
        // The main useEffect will trigger the fetch due to appliedFilters change
    }, [calculateDateRange]);
    
    
    // --- Data Fetching (PAGINATED) ---
    const fetchReportData = useCallback(async (currentFilters, currentSkip, isNewFilter = true) => {
        
        if (!hasMore && !isNewFilter) return; 
        
        if (isNewFilter) {
            setLoadingInitial(true);
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

        const queryString = filtersToQueryString(currentFilters, currentSkip, false);
        
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

                const fetchedCount = data.data ? data.data.length : 0;
                setHasMore(fetchedCount === PAGE_LIMIT);
                
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
    }, [hasMore, filtersToQueryString]); 

    
    // Handler for the 'Go' button click from Navbar
    const handleApplyFilters = useCallback((newFilters) => {
        // Reset pagination when a new filter is applied manually
        setReportData([]);
        setSkip(0);
        setHasMore(true);
        
        // The newFilters contains the filter values from the Navbar state
        setAppliedFilters(newFilters);
        
        const isDateFilterApplied = newFilters.date_from || newFilters.date_to;
        setActiveTimeline(isDateFilterApplied ? '' : 'month');
        
        fetchReportData(newFilters, 0, true);
    }, [fetchReportData]);

    // Initial load and Filter Synchronization Logic (MODIFIED)
    useEffect(() => {
        let initialFilters = {};
        let initialTimeline = 'month';

        if (reportContext) {
            if (reportContext.type === 'static') {
                initialFilters = {};
                initialTimeline = 'month';
            } else if (reportContext.type === 'dynamic') {
                initialFilters = {
                    zone_id: reportContext.filters?.zone_id || [], 
                    street_id: reportContext.filters?.street_id || [], 
                    unit_id: reportContext.filters?.unit_id || [], 
                    date_from: reportContext.filters?.date_from || '', 
                    date_to: reportContext.filters?.date_to || ''
                };
                
                if (initialFilters.date_from || initialFilters.date_to) {
                    initialTimeline = '';
                } else {
                    initialTimeline = 'month';
                }
            }
            
            setAppliedFilters(initialFilters);
            setActiveTimeline(initialTimeline); 
            fetchReportData(initialFilters, 0, true);
            
        } else if (Object.keys(appliedFilters).length === 0) { 
            handleTimelineChange('month'); 
        }
    }, [reportContext, fetchReportData, handleTimelineChange]); 


    // --- Infinite Scroll Handler ---
    const handleScroll = useCallback(() => {
        const element = scrollContainerRef.current;
        
        if (element && hasMore && !loadingInitial && !loadingMore) {
            const isNearBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;

            if (isNearBottom) {
                console.log(`Scrolling to fetch next page (skip: ${skip})`);
                fetchReportData(appliedFilters, skip, false);
            }
        }
    }, [appliedFilters, skip, hasMore, loadingInitial, loadingMore, fetchReportData]);


    // Attach scroll listener
    useEffect(() => {
        const element = scrollContainerRef.current;
        if (element) {
            element.addEventListener('scroll', handleScroll);
            return () => element.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);


    // --- SORTING LOGIC ---
    const sortedData = useMemo(() => {
        if (!reportData || sortConfig.key === null) return reportData;

        // Create a copy of the data to sort
        const sortableItems = [...reportData];

        sortableItems.sort((a, b) => {
            const aValue = a[sortConfig.key] || '';
            const bValue = b[sortConfig.key] || '';

            // Handle numeric and date columns (assuming they are numbers or parseable dates)
            if (typeof aValue === 'number' || (sortConfig.key.includes('PRK') || sortConfig.key.includes('Minutes'))) {
                 // Convert to float for accurate numeric comparison
                const valA = parseFloat(aValue);
                const valB = parseFloat(bValue);
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
            } 
            
            // Handle alphabetical (string) columns (including ZoneName, StreetName, Status)
            else {
                // Perform a case-insensitive string comparison
                const strA = String(aValue).toLowerCase();
                const strB = String(bValue).toLowerCase();

                if (strA < strB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (strA > strB) return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            
            return 0;
        });

        return sortableItems;
    }, [reportData, sortConfig]);

    const handleSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key) {
            direction = sortConfig.direction === 'ascending' ? 'descending' : 'ascending';
        }
        setSortConfig({ key, direction });
    };
    // --- END SORTING LOGIC ---

    // --- Download Logic (Excludes pagination parameters) ---
    const handleDownload = async (format) => {
        setDownloadDropdownOpen(false);
        setIsDownloading(true); 
        
        const token = localStorage.getItem('token');
        if (!token) {
            setIsDownloading(false);
            return setGlobalError("Authentication required. Please log in.");
        }
        
        const queryString = filtersToQueryString(appliedFilters, 0, true); 
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
            setIsDownloading(false); 
        }
    };
    

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-poppins">
            
            {/* NEW HEADING: Above Navbar */}
            <h1 className="text-3xl font-extrabold text-[#00BFFF] mb-4 text-center">
                SLA MODULE - PKG 2 - REPORT
            </h1>

            {/* Navbar and Filters */}
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
                        disabled={loadingInitial || reportData.length === 0 || isDownloading}
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
                                disabled={loadingInitial || reportData.length === 0 || isDownloading}
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
                        <TableContent 
                            data={sortedData} 
                            columns={reportColumns} 
                            ref={scrollContainerRef} 
                            sortConfig={sortConfig} 
                            onSort={handleSort} // Pass sort handler
                        />
                        
                        {/* Infinite Scroll Loading Indicator */}
                        {loadingMore && (
                            <div className="text-center py-4 text-[#00BFFF]">
                                <FaSpinner className="animate-spin h-6 w-6 inline-block mr-2" />
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