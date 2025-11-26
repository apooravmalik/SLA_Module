// src/components/MultiSelectDropdown.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FaChevronDown } from 'react-icons/fa';

const MultiSelectDropdown = ({ name, label, options, selectedIds, onChange, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
    const isAllSelected = selectedCount === options.length && options.length > 0;

    const toggleAll = () => {
        if (isAllSelected) {
            onChange({ name, value: [] });
        } else {
            onChange({ name, value: options.map(opt => opt.id) });
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
                    {selectedCount === 0 
                        ? `${label} (All)` 
                        : selectedCount === 1 
                        ? options.find(o => o.id === selectedIds[0])?.name || `${label} (1)`
                        : `${label} (${selectedCount})`}
                </span>
                <FaChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute mt-2 w-60 max-h-64 overflow-y-auto rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 p-2">
                    <label className="flex items-center space-x-2 py-1 px-2 border-b cursor-pointer hover:bg-gray-50">
                        <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={toggleAll}
                            className="text-[#00BFFF] focus:ring-[#00BFFF]"
                        />
                        <span className="font-semibold text-gray-700">Select All ({options.length})</span>
                    </label>
                    {options.length === 0 ? (
                        <p className="text-gray-500 text-sm p-2">No options available.</p>
                    ) : (
                        options.map((option) => (
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
            )}
        </div>
    );
};

export default MultiSelectDropdown;