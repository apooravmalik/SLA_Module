// src/components/MultiSelectDropdown.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react'; // Added useMemo
import { FaChevronDown, FaSearch } from 'react-icons/fa'; // Added FaSearch icon

const MultiSelectDropdown = ({ name, label, options, selectedIds, onChange, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(''); // NEW STATE for search input
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside and clear search
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchTerm(''); // Clear search when closing
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Memoize the filtered options for performance
    const filteredOptions = useMemo(() => {
        if (!searchTerm) {
            return options;
        }
        const lowerCaseSearch = searchTerm.toLowerCase();
        return options.filter(option =>
            option.name.toLowerCase().includes(lowerCaseSearch)
        );
    }, [options, searchTerm]);

    const handleCheckboxChange = (id) => {
        const idInt = parseInt(id, 10);
        let newSelectedIds;

        if (selectedIds.includes(idInt)) {
            newSelectedIds = selectedIds.filter(prevId => prevId !== idInt);
        } else {
            newSelectedIds = [...selectedIds, idInt];
        }

        // Notify parent component with the updated list of IDs
        onChange({ name, value: newSelectedIds });
    };

    const selectedCount = selectedIds.length;
    
    // Check if ALL currently filtered options are selected
    const isAllSelected = filteredOptions.length > 0 && 
        filteredOptions.every(option => selectedIds.includes(option.id));
    
    // Check if ALL options across the *entire list* are selected (for display text only)
    const isAllUnfilteredSelected = selectedCount === options.length && options.length > 0;

    const toggleAll = () => {
        if (isAllSelected) {
            // Unselect all currently FILTERED items
            const idsToKeep = selectedIds.filter(id => 
                !filteredOptions.some(option => option.id === id)
            );
            onChange({ name, value: idsToKeep });
        } else {
            // Select all currently FILTERED items, preserving other selections
            const idsToSelect = filteredOptions.map(opt => opt.id);
            const combinedIds = [...new Set([...selectedIds, ...idsToSelect])];
            onChange({ name, value: combinedIds });
        }
    };

    return (
        <div className="relative z-20" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled}
                className={`py-2 px-4 border rounded-md shadow-sm transition duration-150 flex items-center justify-between space-x-2 w-40 text-sm font-medium
                    ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'}
                    focus:outline-none focus:ring-2 focus:ring-[#00BFFF]`}
            >
                <span className="truncate">
                    {/* Display text based on UNFILTERED selection count */}
                    {isAllUnfilteredSelected 
                        ? `${label} (All)` 
                        : selectedCount === 0 
                        ? `${label} (All)` 
                        : selectedCount === 1 
                        ? options.find(o => o.id === selectedIds[0])?.name || `${label} (1)`
                        : `${label} (${selectedCount})`}
                </span>
                <FaChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute mt-2 w-60 max-h-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 p-2">
                    
                    {/* NEW: Search Input */}
                    <div className="mb-2 flex items-center border border-gray-300 rounded-md bg-gray-50 px-2 py-1">
                        <FaSearch className="w-3 h-3 text-gray-400 mr-2" />
                        <input
                            type="text"
                            placeholder={`Search ${label}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full text-sm bg-transparent focus:outline-none text-gray-700"
                            autoFocus
                        />
                    </div>

                    {/* Select All */}
                    <label className="flex items-center space-x-2 py-1 px-2 border-b cursor-pointer hover:bg-gray-50 sticky top-0 bg-white z-10">
                        <input
                            type="checkbox"
                            // If search is active, check against filtered list, otherwise check against total list
                            checked={searchTerm ? isAllSelected : isAllUnfilteredSelected}
                            onChange={toggleAll}
                            className="text-[#00BFFF] focus:ring-[#00BFFF]"
                        />
                        <span className="font-semibold text-gray-700">
                            Select All ({filteredOptions.length} {searchTerm && `of ${options.length}`})
                        </span>
                    </label>

                    {/* Scrollable Options */}
                    <div className="max-h-52 overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <p className="text-gray-500 text-sm p-2">No results found for "{searchTerm}".</p>
                        ) : (
                            filteredOptions.map((option) => ( // Use filteredOptions here
                                <label key={option.id} className="flex items-center space-x-2 py-1 px-2 cursor-pointer hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(option.id)}
                                        onChange={() => handleCheckboxChange(option.id)}
                                        className="text-[#00BFFF] focus:ring-[#00BFFF]"
                                    />
                                    <span className="text-gray-700">{option.name}</span>
                                </label>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MultiSelectDropdown;