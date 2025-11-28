/* eslint-disable react-hooks/set-state-in-effect */
// src/components/Navbar.jsx
import React, { useState, useEffect, useCallback } from 'react';
import MultiSelectDropdown from './MultiSelectDropdown'; // Import MultiSelectDropdown
import belLogo from "../assets/bel_logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 
const MASTER_DATA_URL = `${API_BASE_URL}/master/filters`;

const Navbar = ({ onFilterChange, onLogout, currentFilters = {} }) => {
    // Master data options (full list, or filtered by cascade)
    const [options, setOptions] = useState({ zones: [], streets: [], units: [] });
    // Active selections (list of IDs)
    const [filters, setFilters] = useState({ 
        zone_id: [], 
        street_id: [], 
        unit_id: [], 
        date_from: currentFilters.date_from || '', 
        date_to: currentFilters.date_to || '' 
    });

    // Helper to build query string for cascading data fetch
    const buildCascadeQueryString = (filters) => {
        const params = new URLSearchParams();
        if (filters.zone_id && filters.zone_id.length > 0) {
            filters.zone_id.forEach(id => params.append('zone_ids', id));
        }
        if (filters.street_id && filters.street_id.length > 0) {
            filters.street_id.forEach(id => params.append('street_ids', id));
        }
        return params.toString();
    };

    // --- Core Fetching Logic (Cascading) ---
    const fetchMasterData = useCallback(async (currentFilters) => {
        const token = localStorage.getItem('token');
        if (!token) return;

        const queryString = buildCascadeQueryString(currentFilters);
        
        try {
            const response = await fetch(`${MASTER_DATA_URL}?${queryString}`, {
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

    // Initial load and cascade effect
    useEffect(() => {
        // Fetch data whenever filters change to get cascaded options
        fetchMasterData(filters);
    }, [filters, fetchMasterData]); 

    // --- Filter Handlers ---
    const handleMultiSelectChange = ({ name, value }) => {
        // 1. Update local state with the new list of IDs
        const newFilters = { ...filters, [name]: value };
        
        // 2. Clear dependent filters on parent change
        if (name === 'zone_id') {
            newFilters.street_id = [];
            newFilters.unit_id = [];
        } else if (name === 'street_id') {
            newFilters.unit_id = [];
        }

        setFilters(newFilters);
        
        // 3. Notify parent (Dashboard/Report) of the *final* list of filters
        onFilterChange(newFilters);
        
        // 4. Debugging: Log applied filters
        console.log("Filters Applied (Multi-Select):", newFilters);
    };

    const handleDateChange = (e) => {
        const { name, value } = e.target;
        const newFilters = { ...filters, [name]: value };
        setFilters(newFilters);
        onFilterChange(newFilters);
        console.log("Filters Applied (Date Change):", newFilters);
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
                
                {/* Filters and Logout */}
                <div className="flex space-x-4 items-center">
                    
                    {/* Zone Dropdown (Triggers Street cascade) */}
                    <MultiSelectDropdown
                        name="zone_id"
                        label="ZONE"
                        options={options.zones}
                        selectedIds={filters.zone_id}
                        onChange={handleMultiSelectChange}
                    />

                    {/* Street Dropdown (Triggers Unit cascade) */}
                    <MultiSelectDropdown
                        name="street_id"
                        label="STREET"
                        options={options.streets}
                        selectedIds={filters.street_id}
                        onChange={handleMultiSelectChange}
                        disabled={options.streets.length === 0 && filters.zone_id.length > 0}
                    />
                    
                    {/* Unit Dropdown */}
                    <MultiSelectDropdown
                        name="unit_id"
                        label="UNIT"
                        options={options.units}
                        selectedIds={filters.unit_id}
                        onChange={handleMultiSelectChange}
                        disabled={options.units.length === 0 && filters.street_id.length > 0}
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