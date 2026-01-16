// client/src/components/ReportPage.jsx
/* eslint-disable no-unused-vars */
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Navbar from "./Navbar";
import {
  FaDownload,
  FaArrowLeft,
  FaSpinner,
  FaSortUp,
  FaSortDown,
  FaChevronLeft,
  FaChevronRight,
  FaAngleDoubleLeft,
  FaAngleDoubleRight
} from "react-icons/fa";
import { sub } from "date-fns";
import MultiSelectDropdown from "./MultiSelectDropdown";

// ------------------------------------------------------------------
// Base Configuration
// ------------------------------------------------------------------
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://172.168.1.15:8001/api";
const REPORT_URL = `${API_BASE_URL}/report/`;
const DOWNLOAD_URL = `${API_BASE_URL}/report/download`;
const DOWNLOAD_PDF_URL = `${API_BASE_URL}/report/download-pdf`;
const CACHE_URL = `${API_BASE_URL}/cache/`;
const INCIDENT_SUBCATEGORIES_URL = `${API_BASE_URL}/report/incident_sub_categories`;

// ------------------------------------------------------------------
// Table Component
// ------------------------------------------------------------------
// client/src/components/ReportPage.jsx (TableContent Only)

const TableContent = ({
  theme,
  data,
  columns,
  sortConfig,
  onSort,
  incidentSubCategories,
  onWaivePenalty,
  selectedWaiverCategories,
  onWaiverCategoryChange,
}) => {
  // --- Style Logic based on Theme Prop ---
  const isDark = theme === 'dark';
  const styles = {
    containerBorder: isDark ? 'border-[#444444]' : 'border-gray-200',
    headerBg: isDark ? 'bg-[#353535]' : 'bg-gray-50',
    headerText: isDark ? 'text-[#b5b5b5]' : 'text-gray-700',
    headerHover: isDark ? 'hover:bg-[#404040]' : 'hover:bg-gray-100',
    rowBg: isDark ? 'bg-[#2b2b2b]' : 'bg-white',
    rowBorder: isDark ? 'border-[#444444]' : 'border-gray-200',
    rowHover: isDark ? 'hover:bg-[#353535]' : 'hover:bg-gray-50',
    textMain: isDark ? 'text-[#f1f1f1]' : 'text-gray-900',
    textMuted: isDark ? 'text-[#b5b5b5]' : 'text-gray-500',
    divideColor: isDark ? 'divide-[#444444]' : 'divide-gray-200'
  };
  // ----------------------------------------

  if (!data || data.length === 0) {
    return (
      <div className={`p-8 text-center border ${styles.containerBorder} rounded-lg ${styles.rowBg}`}>
        <p className={`${styles.textMuted}`}>No report data found for the current page.</p>
      </div>
    );
  }

  const columnHeaders = columns.map((col) => ({
    key: col.key,
    header: col.header,
    width: col.width || "auto",
    isCustom: col.isCustom || false,
  }));

  // Helper to render sort icon
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "ascending" ? (
      <FaSortUp className="w-3 h-3 ml-1" />
    ) : (
      <FaSortDown className="w-3 h-3 ml-1" />
    );
  };

  return (
    <div className={`relative overflow-x-auto shadow-md sm:rounded-lg border ${styles.containerBorder}`}>
      {/* RESTORED: max-h-[70vh] for internal scrolling */}
      <div className="max-h-[70vh] overflow-y-auto">
        <table className={`w-full text-sm text-left ${styles.textMuted}`}>
          {/* RESTORED: sticky top-0 z-30 so headers stay visible while scrolling */}
          <thead className={`text-xs uppercase sticky top-0 z-30 ${styles.headerText} ${styles.headerBg}`}>
            <tr>
              {columnHeaders.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-6 py-3 cursor-pointer ${styles.headerHover}`}
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
          <tbody className={`divide-y ${styles.divideColor}`}>
            {data.map((row, rowIndex) => {
              // Determine current selected subcategory for this IncidentLog_PRK
              const currentSelectedSubcategory =
                selectedWaiverCategories[row.IncidentLog_PRK] != null
                  ? [selectedWaiverCategories[row.IncidentLog_PRK]]
                  : [];

              return (
                <tr
                  key={rowIndex}
                  className={`${styles.rowBg} border-b ${styles.rowBorder} ${styles.rowHover}`}
                >
                  {columnHeaders.map((col) => {
                    if (col.isCustom && col.key === "WaiverCategory") {
                      return (
                        <td
                          key={col.key}
                          className={`px-6 py-4 font-medium ${styles.textMain} whitespace-nowrap`}
                        >
                          <div className="flex items-center space-x-2">
                            <MultiSelectDropdown
                              name={`waiver_category_${row.IncidentLog_PRK}`}
                              label="Select Category"
                              options={incidentSubCategories}
                              selectedIds={currentSelectedSubcategory}
                              onChange={(e) =>
                                onWaiverCategoryChange(
                                  row.IncidentLog_PRK,
                                  e.value
                                )
                              }
                              isSingleSelect={true} // Set to true for single selection
                              onGoClick={(subcategoryId) =>
                                onWaivePenalty(
                                  row.IncidentLog_PRK,
                                  subcategoryId
                                )
                              } // Pass the Go handler
                              theme={theme} // Pass theme to dropdown if it supports it
                              // Disable if penalty is already 0, or if no IncidentLog_PRK
                              disabled={
                                row.PenaltyAmount === 0 ||
                                !row.IncidentLog_PRK
                              }
                            />
                          </div>
                        </td>
                      );
                    }

                    const cellValue =
                      row[col.key] !== null && row[col.key] !== undefined
                        ? row[col.key]
                        : "N/A";
                    let displayValue = cellValue.toString();

                    if (col.key === "PenaltyAmount" && cellValue !== "N/A") {
                      displayValue = `₹ ${parseFloat(cellValue).toFixed(2)}`;
                    } else if (
                      (col.key.endsWith("Time") || col.key.endsWith("DTM")) &&
                      cellValue !== "N/A"
                    ) {
                      try {
                        displayValue = new Date(cellValue).toLocaleString();
                      } catch (e) {
                        displayValue = cellValue;
                      }
                    } else if (
                      col.key === "WaiverCategory" &&
                      row.WaiverCategory !== null &&
                      row.WaiverCategory !== undefined
                    ) {
                      // If WaiverCategory is present, display it
                      displayValue =
                        incidentSubCategories.find(
                          (cat) => cat.id === row.WaiverCategory
                        )?.name || row.WaiverCategory;
                    }

                    return (
                      <td
                        key={col.key}
                        className={`px-6 py-4 font-medium ${styles.textMain} whitespace-nowrap`}
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// Main ReportPage Component
// ------------------------------------------------------------------
const ReportPage = ({ onGoToDashboard, onLogout, reportContext, theme, toggleTheme }) => {
  const [appliedFilters, setAppliedFilters] = useState({});
  const [reportData, setReportData] = useState([]);
  const [totalRows, setTotalRows] = useState(0);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [jumpToPage, setJumpToPage] = useState("");

  const [incidentSubCategories, setIncidentSubCategories] = useState([]);
  const [selectedWaiverCategories, setSelectedWaiverCategories] = useState({});

  // Sort State
  const [sortConfig, setSortConfig] = useState({
    key: "IncidentLog_PRK",
    direction: "descending",
  });

  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [activeTimeline, setActiveTimeline] = useState("month");
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const fetchIncidentSubCategories = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const response = await fetch(INCIDENT_SUBCATEGORIES_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setIncidentSubCategories(data.map((item) => ({ id: item.id, name: item.name })));
        }
      } catch (error) {
        console.error("Subcategories fetch error:", error);
      }
    };
    fetchIncidentSubCategories();
  }, []);

  const filtersToQueryString = useCallback(
    (currentFilters, page, limit, currentSortConfig, isDownload = false) => {
      const params = new URLSearchParams();

      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;

        if (Array.isArray(value)) {
          value.forEach((id) => params.append(key, String(id)));
        } else if (value instanceof Date) {
          params.append(key, value.toISOString());
        } else {
          params.append(key, String(value));
        }
      });

      if (!isDownload) {
        const skip = (page - 1) * limit;
        params.append("skip", skip);
        params.append("limit", limit);
        
        if (currentSortConfig && currentSortConfig.key) {
             params.append("sort_key", currentSortConfig.key);
             params.append("sort_dir", currentSortConfig.direction === "ascending" ? "asc" : "desc");
        }
      }

      return params.toString();
    },
    []
  );

  const fetchReportData = useCallback(
    async (currentFilters, page, limit, currentSortConfig) => {
      setLoading(true);
      setGlobalError(null);

      const token = localStorage.getItem("token");
      if (!token) {
        setGlobalError("Authentication required.");
        setLoading(false);
        return;
      }

      const queryString = filtersToQueryString(currentFilters, page, limit, currentSortConfig, false);

      try {
        const response = await fetch(`${REPORT_URL}?${queryString}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          setReportData(data.data || []);
          setTotalRows(data.total_rows || 0);
        } else {
          const errorData = await response.json().catch(() => ({}));
          setGlobalError(errorData.detail || "Failed to load report data.");
        }
      } catch (error) {
        setGlobalError("Network error while fetching report data.");
      } finally {
        setLoading(false);
      }
    },
    [filtersToQueryString]
  );

  const handleSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    
    const newSortConfig = { key, direction };
    setSortConfig(newSortConfig);
    
    fetchReportData(appliedFilters, currentPage, rowsPerPage, newSortConfig);
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= Math.ceil(totalRows / rowsPerPage)) {
      setCurrentPage(newPage);
      fetchReportData(appliedFilters, newPage, rowsPerPage, sortConfig);
    }
  };

  const handleRowsPerPageChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setRowsPerPage(newLimit);
    setCurrentPage(1);
    fetchReportData(appliedFilters, 1, newLimit, sortConfig);
  };

  const handleJumpToPage = (e) => {
      e.preventDefault();
      const pageNum = parseInt(jumpToPage, 10);
      if (pageNum && pageNum > 0 && pageNum <= Math.ceil(totalRows / rowsPerPage)) {
          handlePageChange(pageNum);
          setJumpToPage("");
      }
  };

  useEffect(() => {
    if (hasInitializedRef.current && !reportContext) return;

    let initialFilters = {};
    if (reportContext) {
      if (reportContext.type === "static") {
        initialFilters = calculateDateRange("month");
      } else if (reportContext.type === "dynamic") {
        initialFilters = {
          zone_id: reportContext.filters?.zone_id || [],
          street_id: reportContext.filters?.street_id || [],
          unit_id: reportContext.filters?.unit_id || [],
          date_from: reportContext.filters?.date_from || "",
          date_to: reportContext.filters?.date_to || "",
        };
        if (!initialFilters.date_from || !initialFilters.date_to) {
           initialFilters = { ...initialFilters, ...calculateDateRange("month") };
        }
      }
      
      setAppliedFilters(initialFilters);
      setActiveTimeline(initialFilters.date_from ? "" : "month");
      hasInitializedRef.current = true;
      
      fetchReportData(initialFilters, 1, rowsPerPage, sortConfig);
    } else if (!hasInitializedRef.current) {
        const defaultDate = calculateDateRange("month");
        setAppliedFilters(defaultDate);
        fetchReportData(defaultDate, 1, rowsPerPage, sortConfig);
        hasInitializedRef.current = true;
    }
  }, [reportContext, rowsPerPage]); 

  const handleApplyFilters = useCallback((newFilters) => {
      setAppliedFilters(newFilters);
      setCurrentPage(1);
      fetchReportData(newFilters, 1, rowsPerPage, sortConfig);
      
      const isDateFilterApplied = newFilters.date_from || newFilters.date_to;
      setActiveTimeline(isDateFilterApplied ? "" : "month");
  }, [fetchReportData, rowsPerPage, sortConfig]);

  const calculateDateRange = (timeline) => {
    const now = new Date();
    let startDate;
    if (timeline === "day") startDate = sub(now, { hours: 24 });
    else if (timeline === "week") startDate = sub(now, { weeks: 1 });
    else if (timeline === "month") startDate = sub(now, { months: 1 });

    return {
      date_from: startDate ? startDate.toISOString().split("T")[0] : "",
      date_to: now.toISOString().split("T")[0],
    };
  };

  const handleTimelineChange = (timeline) => {
      setActiveTimeline(timeline);
      if (timeline) {
          const newDates = calculateDateRange(timeline);
          const newFilters = { ...appliedFilters, ...newDates };
          setAppliedFilters(newFilters);
          setCurrentPage(1);
          fetchReportData(newFilters, 1, rowsPerPage, sortConfig);
      }
  };

  const handleWaiverCategoryChange = useCallback((incidentLogPrk, selectedIds) => {
    setSelectedWaiverCategories((prev) => ({
      ...prev,
      [incidentLogPrk]: selectedIds.length > 0 ? selectedIds[0] : null,
    }));
  }, []);

  const handleWaivePenalty = useCallback(async (incidentLogPrk, subcategoryId) => {
      if (!incidentLogPrk || !subcategoryId) return;
      setLoading(true);
      const token = localStorage.getItem("token");
      try {
        const response = await fetch(`${CACHE_URL}waive_penalty`, {
          method: "POST",
          headers: {
             Authorization: `Bearer ${token}`,
             "Content-Type": "application/json"
          },
          body: JSON.stringify({
            date_from: appliedFilters.date_from,
            date_to: appliedFilters.date_to,
            incident_log_prk: incidentLogPrk,
            subcategory_id: subcategoryId,
          }),
        });
        if (response.ok) {
           fetchReportData(appliedFilters, currentPage, rowsPerPage, sortConfig);
        }
      } catch (error) { console.error(error); }
      finally { setLoading(false); }
  }, [appliedFilters, currentPage, rowsPerPage, fetchReportData, sortConfig]);

    const handleRefreshCache = async () => {
        setIsRefreshingCache(true);
        const token = localStorage.getItem("token");
        try {
            await fetch(`${CACHE_URL}refresh_cache`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ date_from: appliedFilters.date_from, date_to: appliedFilters.date_to }),
            });
            setCurrentPage(1);
            fetchReportData(appliedFilters, 1, rowsPerPage, sortConfig);
        } catch(e) { console.error(e); }
        finally { setIsRefreshingCache(false); }
    };
    
    const handleDownload = async (format) => {
        setDownloadDropdownOpen(false);
        setIsDownloading(true);
        const token = localStorage.getItem("token");
        const queryString = filtersToQueryString(appliedFilters, 0, 0, sortConfig, true);
        const url = format === "PDF" ? `${DOWNLOAD_PDF_URL}?${queryString}` : `${DOWNLOAD_URL}?${queryString}`;
        
        try {
            const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) {
                const blob = await response.blob();
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.download = `report.${format.toLowerCase()}`;
                link.click();
            }
        } catch (e) { console.error(e); }
        finally { setIsDownloading(false); }
    }

    const reportColumns = [
        { header: "NVR Alias", key: "nvrAlias_TXT", width: "130px" },
        { header: "Camera Name", key: "camName_TXT", width: "130px" },
        { header: "Constituencies", key: "ZoneName" },
        { header: "RWA", key: "StreetName" },
        { header: "PKG", key: "UnitName" },
        { header: "Incident Log PRK", key: "IncidentLog_PRK", width: "130px" },
        { header: "Category", key: "WaiverCategory", width: "150px", isCustom: true }, 
        { header: "Offline Time", key: "OfflineTime", width: "150px" },
        { header: "Online Time", key: "OnlineTime", width: "150px" },
        { header: "Offline Minutes", key: "OfflineMinutes" },
        { header: "Penalty", key: "PenaltyAmount", width: "100px" },
      ];

  const totalPages = Math.ceil(totalRows / rowsPerPage);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] p-6 font-poppins transition-colors duration-300" style={{ backgroundColor: "var(--bg-app)" }}>
      <h1 className="text-3xl font-extrabold mb-4 text-center" style={{ color: "var(--color-secondary-accent)" }}>
        SLA MODULE - PKG 2 - REPORT
      </h1>

      <Navbar onApplyFilters={handleApplyFilters} onLogout={onLogout} currentFilters={appliedFilters} theme={theme} toggleTheme={toggleTheme} />

      <div className="mt-6 flex justify-between items-center pb-4 border-b" style={{ borderColor: "var(--border-main)" }}>
        <div className="flex items-center space-x-4">
          <button onClick={onGoToDashboard} className="py-2 px-4 rounded-lg shadow-md font-semibold flex items-center space-x-2 hover:opacity-90" style={{ backgroundColor: "var(--bg-panel)", color: "var(--text-main)", border: "1px solid var(--border-main)" }}>
            <FaArrowLeft /> <span>Back to Dashboard</span>
          </button>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-main)" }}>Report Data</h2>
        </div>
        <div className="flex space-x-3">
             <select value={activeTimeline} onChange={(e) => handleTimelineChange(e.target.value)} className="py-2 px-4 rounded-lg border" style={{ backgroundColor: "var(--bg-panel)", color: "var(--text-main)", borderColor: "var(--border-main)" }}>
                <option value="">Custom Date</option>
                <option value="day">Last 24 Hours</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
             </select>
             <button onClick={handleRefreshCache} disabled={isRefreshingCache} className="py-2 px-4 rounded-lg text-white bg-gray-600 hover:bg-gray-700 flex items-center gap-2">
                {isRefreshingCache && <FaSpinner className="animate-spin" />} Refresh Cache
             </button>
             <div className="relative">
                <button onClick={() => setDownloadDropdownOpen(!downloadDropdownOpen)} className="py-2 px-4 rounded-lg text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
                     {isDownloading ? <FaSpinner className="animate-spin" /> : <FaDownload />} Download
                </button>
                {downloadDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-xl z-50 border">
                        <button onClick={() => handleDownload("PDF")} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800">PDF</button>
                        <button onClick={() => handleDownload("CSV")} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800">CSV</button>
                    </div>
                )}
             </div>
        </div>
      </div>

      {globalError && <div className="mt-4 p-3 bg-red-100 text-red-700 border border-red-400 rounded">{globalError}</div>}

      <div className="mt-6">
        {loading ? (
          <div className="text-center py-12 text-blue-500"><FaSpinner className="animate-spin h-8 w-8 inline-block mr-3" /> Loading...</div>
        ) : (
          <>
            {/* --- PAGINATION CONTROLS MOVED ABOVE TABLE --- */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 p-4 rounded-lg border shadow-sm" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-main)" }}>
                <div className="flex items-center space-x-2 mb-4 md:mb-0">
                    <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Rows per page:</span>
                    <select 
                        value={rowsPerPage} 
                        onChange={handleRowsPerPageChange}
                        className="p-1 rounded border text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ backgroundColor: "var(--bg-app)", color: "var(--text-main)", borderColor: "var(--border-main)" }}
                    >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                        <option value={5000}>5000</option>
                    </select>
                    <span className="text-sm ml-4" style={{ color: "var(--text-muted)" }}>
                        Showing {((currentPage - 1) * rowsPerPage) + 1} - {Math.min(currentPage * rowsPerPage, totalRows)} of {totalRows.toLocaleString()}
                    </span>
                </div>

                <div className="flex items-center space-x-1">
                    <button onClick={() => handlePageChange(1)} disabled={currentPage === 1} className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ color: "var(--text-main)" }}> <FaAngleDoubleLeft /> </button>
                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ color: "var(--text-main)" }}> <FaChevronLeft /> </button>
                    <span className="mx-2 text-sm font-semibold" style={{ color: "var(--text-main)" }}>Page {currentPage} of {totalPages || 1}</span>
                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0} className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${currentPage === totalPages || totalPages === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ color: "var(--text-main)" }}> <FaChevronRight /> </button>
                    <button onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages || totalPages === 0} className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${currentPage === totalPages || totalPages === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} style={{ color: "var(--text-main)" }}> <FaAngleDoubleRight /> </button>
                </div>

                <form onSubmit={handleJumpToPage} className="flex items-center space-x-2">
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>Go to page:</span>
                    <input type="number" min="1" max={totalPages} value={jumpToPage} onChange={(e) => setJumpToPage(e.target.value)} className="w-16 p-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none text-center" style={{ backgroundColor: "var(--bg-app)", color: "var(--text-main)", borderColor: "var(--border-main)" }} placeholder="#" />
                    <button type="submit" className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50" disabled={!jumpToPage}>Go</button>
                </form>
            </div>

            <TableContent
              data={reportData}
              theme={theme}
              columns={reportColumns}
              sortConfig={sortConfig}
              onSort={handleSort}
              incidentSubCategories={incidentSubCategories}
              selectedWaiverCategories={selectedWaiverCategories}
              onWaiverCategoryChange={handleWaiverCategoryChange}
              onWaivePenalty={handleWaivePenalty}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ReportPage;