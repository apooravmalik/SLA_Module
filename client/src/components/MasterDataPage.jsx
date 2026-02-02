// client/src/components/MasterDataPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './Navbar'; 
import { FaArrowLeft, FaSpinner } from 'react-icons/fa';

// ------------------------------------------------------------------
// Base Configuration
// ------------------------------------------------------------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://172.168.1.15:8001/api'; 
const PAGE_LIMIT = 500; 

const ENDPOINTS = {
    zone: `${API_BASE_URL}/master/zones`,
    street: `${API_BASE_URL}/master/streets`,
    unit: `${API_BASE_URL}/master/units`,
    incident: `${API_BASE_URL}/master/incidents`, 
};

const columnDefinitions = {
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

const formatCellValue = (key, value) => {
    if (value === null || value === undefined) return 'N/A';
    if (key === 'inlDateTime_DTM') {
        try { return new Date(value).toLocaleString(); } catch (e) { return value.toString(); }
    }
    return value.toString();
};


// ------------------------------------------------------------------
// Table Display Component
// ------------------------------------------------------------------
const MasterDataTable = ({ data, columns }) => {
    if (!data || data.length === 0) {
        return <p className="text-[var(--text-muted)] p-4">No master data found for current filters.</p>;
    }
    
    return (
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg bg-[var(--bg-panel)]">
            <div className="max-h-[70vh] overflow-y-auto"> 
                <table className="w-full text-sm text-left text-[var(--text-muted)]">
                    <thead className="text-xs text-[var(--text-main)] uppercase bg-[var(--bg-app)] sticky top-0 z-10">
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
                            <tr key={rowIndex} className="bg-[var(--bg-panel)] border-b border-[var(--border-main)] hover:bg-[var(--bg-app)] transition-colors">
                                {columns.map(col => {
                                    const displayValue = formatCellValue(col.key, row[col.key]);
                                    return (
                                        <td key={col.key} className="px-6 py-4 font-medium text-[var(--text-main)] whitespace-nowrap">
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
const MasterDataPage = ({ onGoToDashboard, onLogout, masterContext, theme, toggleTheme }) => {
    const [data, setData] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [globalError, setGlobalError] = useState(null);
    
    const [skip, setSkip] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const type = masterContext?.type;
    const subtype = masterContext?.subtype;
    const title = titleMap[subtype || type] || 'Master Data Details'; 
    const columns = columnDefinitions[type] || [];
    const url = ENDPOINTS[type];
    const isPaginated = type === 'incident';

    const dummyFilterHandler = useCallback(() => {
        // Master Data page doesn't use the navbar filters directly for fetching itself
    }, []);

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
        if (statusFilter) params.append('status_filter', String(statusFilter));
        params.append('skip', String(currentSkip));
        params.append('limit', String(PAGE_LIMIT));
        return params.toString();
    }, []);


    // ------------------------------------------------------------------
    // 🔥 FIXED FETCH FUNCTION (Broken Loop Fix)
    // ------------------------------------------------------------------
    const fetchData = useCallback(async (currentSkip, isNewQuery = true) => {
        if (!url) {
            setGlobalError(`Invalid master data type: ${type}`);
            setLoadingInitial(false);
            return;
        }

        // NOTE: We DO NOT check 'hasMore' here anymore. 
        // We check it in handleLoadMore instead to avoid dependency loops.
        
        if (isNewQuery) {
            setLoadingInitial(true);
            setData([]);
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
        if (isPaginated) {
            const filters = masterContext?.filters || {};
            const statusFilter = masterContext?.status; 
            const queryString = incidentFiltersToQueryString(filters, statusFilter, currentSkip);
            fullUrl = `${url}?${queryString}`;
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
                    const fetchedData = result.data || [];
                    setData(prevData => isNewQuery ? fetchedData : [...prevData, ...fetchedData]);
                    setTotalCount(result.total_count || 0);
                    
                    // Update Pagination State
                    setSkip(currentSkip + fetchedData.length);
                    setHasMore(fetchedData.length === PAGE_LIMIT);

                } else {
                    setData(result.data || []);
                    setTotalCount(result.total_count || 0);
                    setHasMore(false);
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                setGlobalError(errorData.detail || `Failed to load ${title} data (Status: ${response.status})`);
            }
        } catch (error) {
            setGlobalError(`Network error while fetching ${title} data.`);
        } finally {
            setLoadingInitial(false);
            setLoadingMore(false);
        }
    // 🔥 REMOVED 'hasMore' from dependency array to prevent infinite loop
    }, [url, title, type, masterContext, isPaginated, incidentFiltersToQueryString]); 


    // Initial Fetch Effect
    useEffect(() => {
        fetchData(0, true);
    }, [fetchData]);


    // 🔥 UPDATED LOAD MORE HANDLER
    const handleLoadMore = () => {
        if (hasMore && !loadingMore) {
            fetchData(skip, false);
        }
    };


    return (
        <div className="min-h-screen bg-[var(--bg-app)] p-6 font-poppins transition-colors duration-300">
            
            <h1 className="text-3xl font-extrabold text-[#00BFFF] mb-4 text-center">
                SLA MODULE - PKG 2 - MASTER DATA
            </h1>

            <Navbar 
                onApplyFilters={dummyFilterHandler} 
                onLogout={onLogout} 
                currentFilters={{}} 
                theme={theme}
                toggleTheme={toggleTheme}
            />

            <div className="mt-6 flex justify-between items-center pb-4 border-b border-[var(--border-main)]">
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={onGoToDashboard} 
                        className="py-2 px-4 border border-[var(--border-main)] rounded-lg shadow-md text-[var(--text-main)] font-semibold bg-[var(--bg-panel)] hover:bg-[var(--bg-app)] transition duration-150 flex items-center space-x-2"
                    >
                        <FaArrowLeft />
                        <span>Back to Dashboard</span>
                    </button>
                    <h2 className="text-xl font-bold text-[var(--text-main)]">{title} Details</h2>
                </div>
                <span className="text-md text-[var(--text-muted)]">
                    Total Records: {loadingInitial ? '...' : totalCount.toLocaleString()}
                </span>
            </div>
            
            {globalError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative my-4">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{globalError}</span>
                </div>
            )}

            <div className="mt-6">
                {loadingInitial ? (
                    <div className="text-center py-12 text-[#00BFFF]">
                        <FaSpinner className="animate-spin h-8 w-8 text-[#00BFFF] inline-block mr-3" />
                        Loading master data...
                    </div>
                ) : (
                    <>
                        <MasterDataTable data={data} columns={columns} />
                        
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
                                        className="py-2 px-6 bg-[#00BFFF] text-white rounded-lg hover:bg-sky-600 transition duration-150"
                                    >
                                        Load More ({Math.min(PAGE_LIMIT, totalCount - skip)})
                                    </button>
                                )}
                                {!hasMore && data.length > 0 && (
                                    <p className="text-[var(--text-muted)] text-sm">
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