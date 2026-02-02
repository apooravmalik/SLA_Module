// src/components/Navbar.jsx
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import MultiSelectDropdown from './MultiSelectDropdown'; 
import belLogo from "../assets/bel_logo.png";
import { FaPlay, FaSun, FaMoon, FaUndo } from 'react-icons/fa';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Use relative path so Vite Proxy forwards it correctly
const MASTER_DATA_URL = `${API_BASE_URL}/master/filters`;

// ---  GLOBAL CACHE (Persists across tab switches/remounts) ---
// This prevents the API from being called again if we already have the data in memory.
const cachedMasterData = {}; 

const Navbar = ({ onApplyFilters, onLogout, currentFilters = {}, theme, toggleTheme }) => {
    const [options, setOptions] = useState({ zones: [], streets: [], units: [] });
    
    // Track if we have done the initial load
    const optionsLoaded = useRef(false);

    const [filters, setFilters] = useState({ 
        zone_id: currentFilters.zone_id || [], 
        street_id: currentFilters.street_id || [], 
        unit_id: currentFilters.unit_id || [], 
        date_from: currentFilters.date_from || '', 
        date_to: currentFilters.date_to || '' 
    });
    
    // Sync with parent props
    useEffect(() => {
        setFilters({
            zone_id: currentFilters.zone_id || [], 
            street_id: currentFilters.street_id || [], 
            unit_id: currentFilters.unit_id || [], 
            date_from: currentFilters.date_from || '', 
            date_to: currentFilters.date_to || '' 
        });
    }, [currentFilters]);

    // --------------------------------------------------------------------------
    // FETCH FUNCTION WITH CACHING
    // --------------------------------------------------------------------------
    const fetchMasterData = useCallback(async (zoneIds = [], streetIds = []) => {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Create a unique key for this specific filter combination
        // e.g., "zones:1,2|streets:" or "zones:|streets:" (for base data)
        const cacheKey = `zones:${zoneIds.sort().join(',')}|streets:${streetIds.sort().join(',')}`;

        // 1. CHECK CACHE FIRST (The Fix for "Again and Again" calls)
        if (cachedMasterData[cacheKey]) {
            // If we have "Base Data" (no filters), ensure we mark loaded
            if (zoneIds.length === 0 && streetIds.length === 0) {
                optionsLoaded.current = true;
            }
            
            // If this is a filtered request, we might need to merge it with base data
            // But for simplicity, let's just use the cached result logic below
            const data = cachedMasterData[cacheKey];
            
            // We still run the state update logic to ensure dropdowns don't shrink
            setOptions(prev => ({
                zones: (zoneIds.length > 0) ? prev.zones : data.zones,
                streets: (streetIds.length > 0) ? prev.streets : data.streets,
                units: data.units
            }));
            return; // Exit function, NO API CALL
        }

        // Helper to perform the actual API fetch
        const callApi = async (z, s) => {
            const params = new URLSearchParams();
            if (z && z.length > 0) z.forEach(id => params.append("zone_ids", id));
            if (s && s.length > 0) s.forEach(id => params.append("street_ids", id));
            
            const url = `${MASTER_DATA_URL}?${params.toString()}`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            return res.ok ? await res.json() : null;
        };

        try {
            // STEP 1: INITIAL BASE LOAD (If missing)
            let baseData = null;
            const baseKey = "zones:|streets:";
            
            // If we don't have base data in memory, fetch it
            if (!cachedMasterData[baseKey] && !optionsLoaded.current) {
                 baseData = await callApi([], []); 
                 if (baseData) cachedMasterData[baseKey] = baseData; // Save to Cache
            } else {
                 baseData = cachedMasterData[baseKey];
            }

            // STEP 2: FETCH REQUESTED OPTIONS
            // We fetch specific data for the current selection
            const streetOptionsData = await callApi(zoneIds, []); 
            const unitOptionsData = await callApi(zoneIds, streetIds);

            if (streetOptionsData && unitOptionsData) {
                // Save to Cache for next time
                cachedMasterData[`zones:${zoneIds.sort().join(',')}|streets:`] = streetOptionsData;
                cachedMasterData[cacheKey] = unitOptionsData;

                // Update State
                setOptions(prev => ({
                    // Use Base Data for Zones (prevents shrinking)
                    zones: baseData ? baseData.zones : prev.zones,
                    // Use Filtered Streets (All streets in the selected Zone)
                    streets: streetOptionsData.streets,
                    // Use Specific Units
                    units: unitOptionsData.units
                }));
                
                optionsLoaded.current = true;
            }

        } catch (error) {
            console.error("Error fetching master filters:", error);
        }
    }, []);

    // --------------------------------------------------------------------------
    // UPDATED EFFECT: Using JSON.stringify to prevent infinite loops
    // --------------------------------------------------------------------------
    useEffect(() => {
        fetchMasterData(filters.zone_id, filters.street_id);
    // Check array *values* not references. 
    // This stops the effect from firing if the array is recreated but identical.
    }, [
        JSON.stringify(filters.zone_id), 
        JSON.stringify(filters.street_id), 
        fetchMasterData
    ]); 

    
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

    const handleClearFilters = () => {
        const emptyFilters = { zone_id: [], street_id: [], unit_id: [], date_from: '', date_to: '' };
        setFilters(emptyFilters);
        if (onApplyFilters) onApplyFilters(emptyFilters);
    };

    return (
        <div className="bg-[var(--bg-panel)] shadow-md p-4 rounded-lg transition-colors duration-300">
            <div className="flex justify-between items-center">
                
                <img 
                    src={belLogo}
                    alt="BEL Logo"
                    className="h-12 w-auto object-contain bg-white rounded-md p-1"
                />
                
                <div className="flex space-x-4 items-center">
                    
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
                    />

                    <input
                        type="date"
                        name="date_to"
                        value={filters.date_to || ''}
                        onChange={handleDateChange}
                        className="p-2 border border-[var(--border-main)] bg-[var(--bg-app)] text-[var(--text-main)] rounded-md shadow-sm focus:ring-[#00BFFF] focus:border-[#00BFFF] w-32"
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
                        onClick={handleClearFilters}
                        className="py-2 px-4 rounded-lg bg-gray-500 text-white font-semibold hover:bg-gray-600 transition duration-150 flex items-center space-x-2"
                        title="Remove All Filters"
                    >
                        <FaUndo className="w-3 h-3"/>
                        <span>Clear</span>
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