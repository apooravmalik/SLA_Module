// src/components/TableComponent.jsx
import React from 'react';

const TableComponent = ({ data, columns }) => {
    if (!data || data.length === 0) {
        return <p className="text-gray-500 p-4">No report data found for the current filters.</p>;
    }

    // --- Dynamic Column Headers ---
    const columnHeaders = columns.map(col => ({
        key: col.key,
        header: col.header,
        width: col.width || 'auto', // Use explicit width if provided
    }));

    return (
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
            {/* Wrapper for vertical scrolling and sticky header */}
            <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    
                    {/* Table Header (Sticky) */}
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
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
                    <tbody>
                        {data.map((row, rowIndex) => (
                            <tr key={rowIndex} className="bg-white border-b hover:bg-gray-50">
                                {columnHeaders.map(col => {
                                    const cellValue = row[col.key] !== null ? row[col.key].toString() : 'N/A';
                                    
                                    // Special formatting for Penalty and Time
                                    let displayValue = cellValue;
                                    if (col.key === 'PenaltyAmount') {
                                        displayValue = `£ ${parseFloat(cellValue).toFixed(2)}`;
                                    } else if (col.key.endsWith('Time') && cellValue !== 'N/A') {
                                        // Simple date formatting (adjust as needed)
                                        displayValue = new Date(cellValue).toLocaleString();
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

export default TableComponent;