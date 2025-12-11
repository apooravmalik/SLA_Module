// src/components/Navbar.jsx
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useCallback } from 'react';
import MultiSelectDropdown from './MultiSelectDropdown'; // Import MultiSelectDropdown
import belLogo from "../assets/bel_logo.png";
import { FaPlay } from 'react-icons/fa';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 
const MASTER_DATA_URL = `${API_BASE_URL}/master/filters`;

// Renamed onFilterChange to onApplyFilters
const Navbar = ({ onApplyFilters, onLogout, currentFilters = {} }) => {
    // Master data options (full list, now independent)
    const [options, setOptions] = useState({ zones: [], streets: [], units: [] });
    
    // Active selections (internal state) - Initialized from applied filters
    const [filters, setFilters] = useState({ 
        zone_id: currentFilters.zone_id || [], 
        street_id: currentFilters.street_id || [], 
        unit_id: currentFilters.unit_id || [], 
        date_from: currentFilters.date_from || '', 
        date_to: currentFilters.date_to || '' 
    });
    
    // Sync internal state if currentFilters prop changes (e.g. after a timeline quick-filter on ReportPage)
    useEffect(() => {
        // FIX: Ensure all filter list fields are arrays
        setFilters({
            zone_id: currentFilters.zone_id || [], 
            street_id: currentFilters.street_id || [], 
            unit_id: currentFilters.unit_id || [], 
            date_from: currentFilters.date_from || '', 
            date_to: currentFilters.date_to || '' 
        });
    }, [currentFilters]);

    // --- Core Fetching Logic (Independent Fetch - No cascade query string needed) ---
    const fetchMasterData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Since the requirement is no cascading, we fetch all filters with no query params.
        try {
            const response = await fetch(MASTER_DATA_URL, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                // All options lists will now be complete and unfiltered
                setOptions(data);
            }
        } catch (error) {
            console.error("Error fetching master filters:", error);
        }
    }, []);

    // Initial load effect (Fetch ALL master data only once on mount.)
    useEffect(() => {
        fetchMasterData();
    }, [fetchMasterData]); 

    // --- Filter Handlers ---
    const handleMultiSelectChange = ({ name, value }) => {
        // 1. Update local state with the new list of IDs
        const newFilters = { ...filters, [name]: value };
        
        // 2. Update local state. DO NOT call the parent API handler here.
        setFilters(newFilters);
        
        console.log("Filters Updated (Multi-Select):", newFilters);
    };

    const handleDateChange = (e) => {
        const { name, value } = e.target;
        const newFilters = { ...filters, [name]: value };
        // Update local state. DO NOT call the parent API handler here.
        setFilters(newFilters);
        console.log("Filters Updated (Date Change):", newFilters);
    };
    
    // --- Manual Submission Handler ---
    const handleGoClick = () => {
        // Only trigger the API call via the parent component when 'Go' is clicked
        if (onApplyFilters) {
            onApplyFilters(filters);
            console.log("Applying filters:", filters);
        }
    };


    return (
        <div className="bg-white shadow-md p-4 rounded-lg">
            <div className="flex justify-between items-center">
                
                {/* Logo */}
                <img 
                    src={belLogo}
                    alt="BEL Logo"
                    className="h-12 w-auto object-contain"
                />
                
                {/* Filters and Go Button */}
                <div className="flex space-x-4 items-center">
                    
                      {/* Constituency Dropdown (Now Independent) */}
                    <MultiSelectDropdown
                        name="zone_id"
                        label="CONSTITUENCY"
                        options={options.zones}
                        selectedIds={filters.zone_id}
                        onChange={handleMultiSelectChange}
                    />

                    {/* RWA Dropdown (Now Independent) */}
                    <MultiSelectDropdown
                        name="street_id"
                        label="RWA"
                        options={options.streets}
                        selectedIds={filters.street_id}
                        onChange={handleMultiSelectChange}
                    />
                    
                    {/* Package Dropdown (Now Independent) */}
                    <MultiSelectDropdown
                        name="unit_id"
                        label="PACKAGE"
                        options={options.units}
                        selectedIds={filters.unit_id}
                        onChange={handleMultiSelectChange}
                    />
                    
                    {/* Calendar (Date From) */}
                    <input
                        type="date"
                        name="date_from"
                        value={filters.date_from || ''}
                        onChange={handleDateChange}
                        className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#00BFFF] focus:border-[#00BFFF] w-32"
                        title="Date From"
                    />

                    {/* Calendar (Date To) */}
                    <input
                        type="date"
                        name="date_to"
                        value={filters.date_to || ''}
                        onChange={handleDateChange}
                        className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#00BFFF] focus:border-[#00BFFF] w-32"
                        title="Date To"
                    />
                    
                    {/* Go Button - NEW ADDITION */}
                    <button 
                        onClick={handleGoClick}
                        className="py-2 px-4 rounded-lg bg-[#00BFFF] text-white font-semibold hover:bg-sky-600 transition duration-150 flex items-center space-x-2"
                        title="Apply Filters"
                    >
                        <FaPlay className="w-3 h-3"/>
                        <span>Go</span>
                    </button>
                    
                    {/* Logout Button (if available) */}
                    {onLogout && (
                        <button 
                            onClick={onLogout}
                            className="py-2 px-4 rounded-lg text-gray-600 hover:text-red-500 transition duration-150"
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