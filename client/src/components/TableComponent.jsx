// src/components/TableComponent.jsx
import React, { useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const TableComponent = ({ data, columns, title, theme, emptyMessage = "No data available" }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;
    
    // --- Style Logic based on Theme Prop ---
    const isDark = theme === 'dark';
    const styles = {
        containerBorder: isDark ? 'border-[#444444]' : 'border-gray-200',
        headerBg: isDark ? 'bg-[#353535]' : 'bg-gray-50',
        headerText: isDark ? 'text-[#b5b5b5]' : 'text-gray-700',
        rowBg: isDark ? 'bg-[#2b2b2b]' : 'bg-white',
        rowBorder: isDark ? 'border-[#444444]' : 'border-gray-200',
        rowHover: isDark ? 'hover:bg-[#353535]' : 'hover:bg-gray-50',
        textMain: isDark ? 'text-[#f1f1f1]' : 'text-gray-900',
        textMuted: isDark ? 'text-[#b5b5b5]' : 'text-gray-500',
        divideColor: isDark ? 'divide-[#444444]' : 'divide-gray-200'
    };
    // ----------------------------------------

    // --- FIX: Define columnHeaders ---
    const columnHeaders = columns.map(col => ({
        key: col.key,
        header: col.header,
        width: col.width || 'auto',
    }));
    // --------------------------------

    // Pagination Logic
    const indexOfLastRow = currentPage * rowsPerPage;
    const indexOfFirstRow = indexOfLastRow - rowsPerPage;
    const currentRows = data ? data.slice(indexOfFirstRow, indexOfLastRow) : [];
    const totalPages = data ? Math.ceil(data.length / rowsPerPage) : 0;

    const handlePrev = () => setCurrentPage(prev => Math.max(prev - 1, 1));
    const handleNext = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));

    if (!data || data.length === 0) {
        return <p className={`${styles.textMuted} p-4`}>{emptyMessage}</p>;
    }

    return (
        <div className={`relative overflow-x-auto shadow-md sm:rounded-lg border ${styles.containerBorder}`}>
            <div className="max-h-96 overflow-y-auto">
                <table className={`w-full text-sm text-left ${styles.textMuted}`}>
                    
                    {/* Table Header (Sticky) */}
                    <thead className={`text-xs uppercase sticky top-0 z-10 ${styles.headerText} ${styles.headerBg}`}>
                        <tr>
                            {columnHeaders.map(col => (
                                <th 
                                    key={col.key} 
                                    scope="col" 
                                    className="px-6 py-3" 
                                    style={{ width: col.width }}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    
                    {/* Table Body */}
                    <tbody className={`divide-y ${styles.divideColor}`}>
                        {currentRows.map((row, rowIndex) => (
                            <tr 
                                key={rowIndex} 
                                className={`${styles.rowBg} border-b ${styles.rowBorder} ${styles.rowHover}`}
                            >
                                {columnHeaders.map(col => {
                                    const cellValue = row[col.key] !== null && row[col.key] !== undefined 
                                        ? row[col.key].toString() 
                                        : 'N/A';
                                    
                                    // Special formatting for Penalty and Time
                                    let displayValue = cellValue;
                                    if (col.key === 'PenaltyAmount' && cellValue !== 'N/A') {
                                        displayValue = `₹ ${parseFloat(cellValue).toFixed(2)}`;
                                    } else if (col.key.endsWith('Time') && cellValue !== 'N/A') {
                                        // Simple date formatting (adjust as needed)
                                        try {
                                            displayValue = new Date(cellValue).toLocaleString();
                                        } catch (e) {
                                            displayValue = cellValue;
                                        }
                                    }
                                    
                                    return (
                                        <td key={col.key} className={`px-6 py-4 font-medium whitespace-nowrap ${styles.textMain}`}>
                                            {displayValue}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls (Optional - shown if total pages > 1) */}
            {totalPages > 1 && (
                <div className={`flex justify-between items-center p-4 border-t ${styles.rowBg} ${styles.rowBorder}`}>
                    <span className={`text-sm ${styles.textMuted}`}>
                        Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex space-x-2">
                        <button 
                            onClick={handlePrev} 
                            disabled={currentPage === 1}
                            className={`p-2 rounded-md border ${styles.rowBorder} ${
                                currentPage === 1 
                                ? 'text-gray-400 cursor-not-allowed' 
                                : `${styles.textMain} ${styles.rowHover}`
                            }`}
                        >
                            <FaChevronLeft />
                        </button>
                        <button 
                            onClick={handleNext} 
                            disabled={currentPage === totalPages}
                            className={`p-2 rounded-md border ${styles.rowBorder} ${
                                currentPage === totalPages 
                                ? 'text-gray-400 cursor-not-allowed' 
                                : `${styles.textMain} ${styles.rowHover}`
                            }`}
                        >
                            <FaChevronRight />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TableComponent;