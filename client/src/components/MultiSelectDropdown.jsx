import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FaChevronDown, FaSearch } from 'react-icons/fa';
import { createPortal } from 'react-dom';

const MultiSelectDropdown = ({
    name,
    label,
    options,
    selectedIds,
    onChange,
    disabled = false,
    isSingleSelect = false,
    onGoClick
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null); // ✅ ADDED
    const [dropdownStyle, setDropdownStyle] = useState({});

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                menuRef.current &&
                !menuRef.current.contains(event.target)
            ) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

    const currentSingleSelectionId =
        isSingleSelect && selectedIds.length === 1 ? selectedIds[0] : null;

    const filteredOptions = useMemo(() => {
        if (!searchTerm) return options;
        const lower = searchTerm.toLowerCase();
        return options.filter(option =>
            option.name.toLowerCase().includes(lower)
        );
    }, [options, searchTerm]);

    const handleCheckboxChange = (id) => {
        const idInt = parseInt(id, 10);

        if (isSingleSelect) {
            const newSelection = idInt === currentSingleSelectionId ? null : idInt;
            onChange({ name, value: newSelection === null ? [] : [newSelection] });
        } else {
            const newSelectedIds = selectedIds.includes(idInt)
                ? selectedIds.filter(prevId => prevId !== idInt)
                : [...selectedIds, idInt];
            onChange({ name, value: newSelectedIds });
        }
    };

    const handleGoClickInternal = () => {
        if (isSingleSelect && currentSingleSelectionId !== null && onGoClick) {
            onGoClick(currentSingleSelectionId);
            setIsOpen(false);
            setSearchTerm('');
        }
    };

    const selectedCount = selectedIds.length;

    const isAllSelected =
        filteredOptions.length > 0 &&
        filteredOptions.every(option => selectedIds.includes(option.id));

    const isAllUnfilteredSelected =
        selectedCount === options.length && options.length > 0;

    const toggleAll = () => {
        if (isSingleSelect) return;

        if (isAllSelected) {
            const idsToKeep = selectedIds.filter(
                id => !filteredOptions.some(option => option.id === id)
            );
            onChange({ name, value: idsToKeep });
        } else {
            const idsToSelect = filteredOptions.map(opt => opt.id);
            const combinedIds = [...new Set([...selectedIds, ...idsToSelect])];
            onChange({ name, value: combinedIds });
        }
    };

    const buttonDisplayText = useMemo(() => {
        if (isSingleSelect) {
            if (currentSingleSelectionId !== null) {
                return (
                    options.find(o => o.id === currentSingleSelectionId)?.name ||
                    `${label} (Selected)`
                );
            }
            return `${label} (None)`;
        } else {
            if (isAllUnfilteredSelected || selectedCount === 0) return `${label} (All)`;
            if (selectedCount === 1)
                return options.find(o => o.id === selectedIds[0])?.name || `${label} (1)`;
            return `${label} (${selectedCount})`;
        }
    }, [
        isSingleSelect,
        currentSingleSelectionId,
        selectedCount,
        options,
        label,
        isAllUnfilteredSelected,
        selectedIds
    ]);

    return (
        <div className="relative z-20" ref={dropdownRef}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => {
                    if (!isOpen && buttonRef.current) {
                        const rect = buttonRef.current.getBoundingClientRect();
                        setDropdownStyle({
                            position: 'fixed',
                            top: rect.bottom + 6,
                            left: rect.left,
                            width: rect.width,
                            zIndex: 10000
                        });
                    }
                    setIsOpen(!isOpen);
                }}
                disabled={disabled}
                className={`py-2 px-4 border rounded-md shadow-sm transition duration-150 flex items-center justify-between space-x-2 w-40 text-sm font-medium
                    ${disabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'}
                    focus:outline-none focus:ring-2 focus:ring-[#00BFFF]`}
            >
                <span className="truncate">{buttonDisplayText}</span>
                <FaChevronDown
                    className={`w-3 h-3 transition-transform ${
                        isOpen ? 'transform rotate-180' : ''
                    }`}
                />
            </button>

            {isOpen &&
                createPortal(
                    <div
                        ref={menuRef}   // ✅ ADDED
                        style={dropdownStyle}
                        className="w-60 max-h-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 p-2 z-[10000]"
                    >
                        {/* Search */}
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
                        {!isSingleSelect && filteredOptions.length > 0 && (
                            <label className="flex items-center space-x-2 py-1 px-2 border-b cursor-pointer hover:bg-gray-50 sticky top-0 bg-white z-10">
                                <input
                                    type="checkbox"
                                    checked={searchTerm ? isAllSelected : isAllUnfilteredSelected}
                                    onChange={toggleAll}
                                    className="text-[#00BFFF] focus:ring-[#00BFFF]"
                                />
                                <span className="font-semibold text-gray-700">
                                    Select All ({filteredOptions.length}{' '}
                                    {searchTerm && `of ${options.length}`})
                                </span>
                            </label>
                        )}

                        {/* Options */}
                        <div className="max-h-52 overflow-y-auto">
                            {filteredOptions.length === 0 ? (
                                <p className="text-gray-500 text-sm p-2">
                                    No results found for "{searchTerm}"
                                </p>
                            ) : (
                                filteredOptions.map(option => (
                                    <label
                                        key={option.id}
                                        className="flex items-center space-x-2 py-1 px-2 cursor-pointer hover:bg-gray-50"
                                    >
                                        <input
                                            type={isSingleSelect ? 'radio' : 'checkbox'}
                                            name={
                                                isSingleSelect
                                                    ? `single-select-${name}`
                                                    : undefined
                                            }
                                            checked={
                                                isSingleSelect
                                                    ? currentSingleSelectionId === option.id
                                                    : selectedIds.includes(option.id)
                                            }
                                            onChange={() => handleCheckboxChange(option.id)}
                                            className="text-[#00BFFF] focus:ring-[#00BFFF]"
                                        />
                                        <span className="text-gray-700">
                                            {option.name}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>

                        {/* Go Button */}
                        {isSingleSelect &&
                            onGoClick &&
                            currentSingleSelectionId !== null && (
                                <div className="px-2 py-2 border-t mt-2">
                                    <button
                                        onClick={handleGoClickInternal}
                                        className="w-full py-2 px-4 bg-[#00BFFF] text-white rounded-lg hover:bg-sky-600 transition duration-150 text-sm font-semibold"
                                    >
                                        Go
                                    </button>
                                </div>
                            )}
                    </div>,
                    document.body
                )}
        </div>
    );
};

export default MultiSelectDropdown;
