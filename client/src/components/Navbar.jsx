// src/components/Navbar.jsx
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useCallback } from 'react';
import MultiSelectDropdown from './MultiSelectDropdown'; 
import belLogo from "../assets/bel_logo.png";
import { FaPlay, FaSun, FaMoon } from 'react-icons/fa';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://172.168.1.15:8001/api'; 
const MASTER_DATA_URL = `${API_BASE_URL}/master/filters`;

// NEW PROPS: theme, toggleTheme
const Navbar = ({ onApplyFilters, onLogout, currentFilters = {}, theme, toggleTheme }) => {
    const [options, setOptions] = useState({ zones: [], streets: [], units: [] });
    
    const [filters, setFilters] = useState({ 
        zone_id: currentFilters.zone_id || [], 
        street_id: currentFilters.street_id || [], 
        unit_id: currentFilters.unit_id || [], 
        date_from: currentFilters.date_from || '', 
        date_to: currentFilters.date_to || '' 
    });
    
    useEffect(() => {
        setFilters({
            zone_id: currentFilters.zone_id || [], 
            street_id: currentFilters.street_id || [], 
            unit_id: currentFilters.unit_id || [], 
            date_from: currentFilters.date_from || '', 
            date_to: currentFilters.date_to || '' 
        });
    }, [currentFilters]);

    const fetchMasterData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await fetch(MASTER_DATA_URL, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setOptions(data);
            }
        } catch (error) {
            console.error("Error fetching master filters:", error);
        }
    }, []);

    useEffect(() => {
        fetchMasterData();
    }, [fetchMasterData]); 

    const handleMultiSelectChange = ({ name, value }) => {
        const newFilters = { ...filters, [name]: value };
        setFilters(newFilters);
    };

    const handleDateChange = (e) => {
        const { name, value } = e.target;
        const newFilters = { ...filters, [name]: value };
        setFilters(newFilters);
    };
    
    const handleGoClick = () => {
        if (onApplyFilters) {
            onApplyFilters(filters);
        }
    };

    return (
        <div className="bg-[var(--bg-panel)] shadow-md p-4 rounded-lg transition-colors duration-300">
            <div className="flex justify-between items-center">
                
                <img 
                    src={belLogo}
                    alt="BEL Logo"
                    className="h-12 w-auto object-contain bg-white rounded-md p-1" // Added bg-white so logo looks good in dark mode
                />
                
                <div className="flex space-x-4 items-center">
                    
                    {/* ... Dropdowns (MultiSelectDropdown) ... */}
                    <MultiSelectDropdown
                        name="zone_id"
                        label="CONSTITUENCY"
                        options={options.zones}
                        selectedIds={filters.zone_id}
                        onChange={handleMultiSelectChange}
                    />
                    <MultiSelectDropdown
                        name="street_id"
                        label="RWA"
                        options={options.streets}
                        selectedIds={filters.street_id}
                        onChange={handleMultiSelectChange}
                    />
                    <MultiSelectDropdown
                        name="unit_id"
                        label="PACKAGE"
                        options={options.units}
                        selectedIds={filters.unit_id}
                        onChange={handleMultiSelectChange}
                    />
                    
                    <input
                        type="date"
                        name="date_from"
                        value={filters.date_from || ''}
                        onChange={handleDateChange}
                        className="p-2 border border-[var(--border-main)] bg-[var(--bg-app)] text-[var(--text-main)] rounded-md shadow-sm focus:ring-[#00BFFF] focus:border-[#00BFFF] w-32"
                        title="Date From"
                    />

                    <input
                        type="date"
                        name="date_to"
                        value={filters.date_to || ''}
                        onChange={handleDateChange}
                        className="p-2 border border-[var(--border-main)] bg-[var(--bg-app)] text-[var(--text-main)] rounded-md shadow-sm focus:ring-[#00BFFF] focus:border-[#00BFFF] w-32"
                        title="Date To"
                    />
                    
                    <button 
                        onClick={handleGoClick}
                        className="py-2 px-4 rounded-lg bg-[#00BFFF] text-white font-semibold hover:bg-sky-600 transition duration-150 flex items-center space-x-2"
                        title="Apply Filters"
                    >
                        <FaPlay className="w-3 h-3"/>
                        <span>Go</span>
                    </button>

                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full border border-[var(--border-main)] text-[var(--text-main)] hover:bg-[var(--bg-app)] transition duration-150"
                        title="Toggle Theme"
                    >
                        {theme === 'dark' ? <FaSun className="text-yellow-400" /> : <FaMoon className="text-gray-600" />}
                    </button>
                    
                    {onLogout && (
                        <button 
                            onClick={onLogout}
                            className="py-2 px-4 rounded-lg text-[var(--text-muted)] hover:text-red-500 transition duration-150"
                        >
                            Logout
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Navbar;