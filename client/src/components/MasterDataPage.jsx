// client/src/components/MasterDataPage.jsx (FIXED for Incident Pagination)
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar'; 
import { FaArrowLeft, FaSpinner } from 'react-icons/fa';

// ------------------------------------------------------------------
// Base Configuration
// ------------------------------------------------------------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 
const PAGE_LIMIT = 500; // Define a fixed page size to prevent crashing

const ENDPOINTS = {
    // Static KPIs
    zone: `${API_BASE_URL}/master/zones`,
    street: `${API_BASE_URL}/master/streets`,
    unit: `${API_BASE_URL}/master/units`,
    // Dynamic KPIs
    incident: `${API_BASE_URL}/master/incidents`, 
};

// Column Definitions for each Master Data Type (Updated labels and Unit columns)
const columnDefinitions = {
    // Static Data Columns
    zone: [
        { header: 'Constituency ID', key: 'CameraZone_PRK', width: '150px' },
        { header: 'Constituency Name', key: 'cznName_TXT' },
    ],
    street: [
        { header: 'RWA ID', key: 'Street_PRK', width: '100px' },
        { header: 'RWA Name', key: 'StreetName' },
        { header: 'Linked Constituency', key: 'ZoneName' },
        { header: 'Post Code', key: 'strPostCode_TXT' },
        { header: 'Description', key: 'strDescription_MEM' },
    ],
    unit: [
        { header: 'Package ID', key: 'Unit_PRK', width: '100px' },
        { header: 'Package Name', key: 'untUnitName_TXT' },
        { header: 'Other Info', key: 'untOtherInfo_MEM' }, 
    ],
    // Dynamic Incident Columns (NEW)
    incident: [
        { header: 'Incident ID', key: 'IncidentLog_PRK', width: '100px' },
        { header: 'Date/Time', key: 'inlDateTime_DTM', width: '180px' },
        { header: 'Status', key: 'StatusName', width: '120px' },
        { header: 'Constituency', key: 'ZoneName' },
        { header: 'RWA', key: 'StreetName' },
        { header: 'Package', key: 'UnitName' },
        { header: 'Category', key: 'CategoryName' },
        { header: 'Details', key: 'inlIncidentDetails_MEM' },
    ]
};

const titleMap = {
    zone: 'Constituencies',
    street: 'RWAs',
    unit: 'Packages',
    incident_open: 'Open Incidents', 
    incident_closed: 'Closed Incidents', 
};

// Helper for formatting data in table (for incident time)
const formatCellValue = (key, value) => {
    if (value === null || value === undefined) return 'N/A';
    
    if (key === 'inlDateTime_DTM') {
        try {
            return new Date(value).toLocaleString();
        } catch (e) {
            return value.toString();
        }
    }
    return value.toString();
};


// ------------------------------------------------------------------
// Table Display Component (Simple for Master Data)
// ------------------------------------------------------------------
const MasterDataTable = ({ data, columns }) => {
    if (!data || data.length === 0) {
        return <p className="text-gray-500 p-4">No master data found for current filters.</p>;
    }
    
    return (
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
            <div className="max-h-[70vh] overflow-y-auto"> 
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                        <tr>
                            {columns.map(col => (
                                <th key={col.key} scope="col" className="px-6 py-3" style={{ minWidth: col.width || 'auto' }}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, rowIndex) => (
                            <tr key={rowIndex} className="bg-white border-b hover:bg-gray-50">
                                {columns.map(col => {
                                    const displayValue = formatCellValue(col.key, row[col.key]);
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


// ------------------------------------------------------------------
// Main MasterDataPage Component
// ------------------------------------------------------------------
const MasterDataPage = ({ onGoToDashboard, onLogout, masterContext }) => {
    const [data, setData] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loadingInitial, setLoadingInitial] = useState(true); // Renamed for clarity
    const [loadingMore, setLoadingMore] = useState(false); // NEW state for loading next page
    const [globalError, setGlobalError] = useState(null);
    
    // NEW PAGINATION STATE
    const [skip, setSkip] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Determine the type, columns, and title from context
    const type = masterContext?.type;
    const subtype = masterContext?.subtype; // For incident_open/closed
    const title = titleMap[subtype || type] || 'Master Data Details'; 
    const columns = columnDefinitions[type] || [];
    const url = ENDPOINTS[type];
    const isPaginated = type === 'incident'; // Only incidents use pagination

    // Handler must be passed to Navbar, but filters are not used on this page
    const dummyFilterHandler = useCallback(() => {
        console.log("Filters applied on MasterDataPage (ignored).");
    }, []);


    // Helper to convert filters to query string for INCIDENT details
    const incidentFiltersToQueryString = useCallback((filters, statusFilter, currentSkip) => {
        const params = new URLSearchParams();
        
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== "") {
                if (Array.isArray(value)) {
                    value.forEach(id => params.append(key, String(id)));
                } else if (key === 'date_from' || key === 'date_to') {
                    params.append(key, String(value));
                }
            }
        });
        
        if (statusFilter) {
            params.append('status_filter', String(statusFilter));
        }
        
        // Add pagination parameters
        params.append('skip', String(currentSkip));
        params.append('limit', String(PAGE_LIMIT));

        return params.toString();
    }, []);


    const fetchData = useCallback(async (currentSkip, isNewQuery = true) => {
        if (!url) {
            setGlobalError(`Invalid master data type: ${type}`);
            setLoadingInitial(false);
            setLoadingMore(false);
            return;
        }

        if (!isNewQuery && !hasMore) return; 
        
        if (isNewQuery) {
            setLoadingInitial(true);
            setData([]); // Clear data only on initial/new query
            setSkip(0);
            setHasMore(true);
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

        let fullUrl = url;

        // If data type is incident, construct URL with dashboard filters and pagination
        if (isPaginated) {
            const filters = masterContext?.filters || {};
            const statusFilter = masterContext?.status; 
            const queryString = incidentFiltersToQueryString(filters, statusFilter, currentSkip);
            fullUrl = `${url}?${queryString}`;
            console.log("INCIDENT API Request URL:", fullUrl);
        }

        try {
            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const result = await response.json();
                
                if (isPaginated) {
                    // Handle paginated response (Incident data)
                    const fetchedData = result.data || [];
                    
                    setData(prevData => isNewQuery ? fetchedData : [...prevData, ...fetchedData]);
                    setTotalCount(result.total_count || 0);
                    
                    // Update pagination state
                    setSkip(currentSkip + fetchedData.length);
                    setHasMore(fetchedData.length === PAGE_LIMIT);

                } else {
                    // Handle static data (non-paginated)
                    setData(result.data || []);
                    setTotalCount(result.total_count || 0);
                    setHasMore(false); // Static lists are complete in one go
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                setGlobalError(errorData.detail || `Failed to load ${title} data (Status: ${response.status})`);
            }
        } catch (error) {
            setGlobalError(`Network error while fetching ${title} data.`);
            console.error('Master data fetch error:', error);
        } finally {
            setLoadingInitial(false);
            setLoadingMore(false);
        }
    }, [url, title, type, masterContext, hasMore, isPaginated, incidentFiltersToQueryString]);

    useEffect(() => {
        // Trigger initial fetch on component mount or context change
        fetchData(0, true);
    }, [fetchData]);


    // Handler for the Load More button
    const handleLoadMore = () => {
        fetchData(skip, false);
    };


    return (
        <div className="min-h-screen bg-gray-50 p-6 font-poppins">
            
            <h1 className="text-3xl font-extrabold text-[#00BFFF] mb-4 text-center">
                SLA MODULE - PKG 2 - MASTER DATA
            </h1>

            {/* Navbar is rendered but filters are inactive on this page */}
            <Navbar onApplyFilters={dummyFilterHandler} onLogout={onLogout} currentFilters={{}} />

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
                    
                    <h2 className="text-xl font-bold text-gray-700">{title} Details</h2>
                </div>
                
                {/* Total Rows Indicator */}
                <span className="text-md text-gray-600">
                    Total Records: {loadingInitial ? '...' : totalCount.toLocaleString()}
                </span>
            </div>
            
            {/* Error Display */}
            {globalError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative my-4" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{globalError}</span>
                </div>
            )}

            {/* Table or Loading Indicator */}
            <div className="mt-6">
                {loadingInitial ? (
                    <div className="text-center py-12 text-[#00BFFF]">
                        <FaSpinner className="animate-spin h-8 w-8 text-[#00BFFF] inline-block mr-3" />
                        Loading master data...
                    </div>
                ) : (
                    <>
                        <MasterDataTable data={data} columns={columns} />
                        
                        {/* Pagination Controls for Incidents */}
                        {isPaginated && (
                            <div className="mt-4 text-center">
                                {loadingMore && (
                                    <div className="text-[#00BFFF] mb-2">
                                        <FaSpinner className="animate-spin h-5 w-5 inline-block mr-2" />
                                        Loading more...
                                    </div>
                                )}
                                {hasMore && !loadingMore && (
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={loadingMore}
                                        className="py-2 px-6 bg-[#00BFFF] text-white rounded-lg hover:bg-sky-600 transition duration-150"
                                    >
                                        Load More ({Math.min(PAGE_LIMIT, totalCount - skip)})
                                    </button>
                                )}
                                {!hasMore && data.length > 0 && (
                                    <p className="text-gray-500 text-sm">
                                        End of list. ({data.length} of {totalCount.toLocaleString()} displayed)
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MasterDataPage;