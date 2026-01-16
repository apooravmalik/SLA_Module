// src/components/MultiSelectDropdown.jsx
import React, { useState, useRef, useEffect } from 'react';
import { FaChevronDown } from 'react-icons/fa';

const MultiSelectDropdown = ({ name, label, options, selectedIds, onChange }) => {
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

    const toggleOption = (id) => {
        let newSelected;
        if (selectedIds.includes(id)) {
            newSelected = selectedIds.filter(item => item !== id);
        } else {
            newSelected = [...selectedIds, id];
        }
        onChange({ name, value: newSelected });
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Dropdown Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-48 p-2 border border-[var(--border-main)] rounded-md shadow-sm bg-[var(--bg-panel)] text-[var(--text-main)] focus:ring-1 focus:ring-[#00BFFF] focus:border-[#00BFFF] text-left"
            >
                <span className="block truncate text-sm">
                    {selectedIds.length > 0 ? `${selectedIds.length} Selected` : label}
                </span>
                <FaChevronDown className="w-3 h-3 text-[var(--text-muted)] ml-2" />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-10 mt-1 w-64 bg-[var(--bg-panel)] border border-[var(--border-main)] rounded-md shadow-lg max-h-60 overflow-auto">
                    <div className="p-2 space-y-1">
                        {options.length === 0 ? (
                            <div className="text-sm text-[var(--text-muted)] px-2 py-1">No options</div>
                        ) : (
                            options.map((opt) => (
                                <label 
                                    key={opt.id} 
                                    className="flex items-center space-x-3 px-2 py-1 hover:bg-[var(--bg-app)] rounded cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(opt.id)}
                                        onChange={() => toggleOption(opt.id)}
                                        className="h-4 w-4 text-[#00BFFF] border-[var(--border-main)] rounded focus:ring-[#00BFFF]"
                                    />
                                    <span className="text-sm text-[var(--text-main)] truncate" title={opt.name}>
                                        {opt.name}
                                    </span>
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