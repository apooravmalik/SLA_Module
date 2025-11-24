// src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';

// NOTE: You'll need a way to pass the active filters back up to the parent component (DashboardPage)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'; 

const Navbar = ({ onFilterChange }) => {
    const [masterData, setMasterData] = useState({ zones: [], streets: [], units: [] });
    const [filters, setFilters] = useState({ 
        zone_id: '', 
        street_id: '', 
        unit_id: '', 
        date_from: '', 
        date_to: '' 
    });
    
    // Fetch master data on component mount
    useEffect(() => {
        const token = localStorage.getItem('token'); // Assuming token is stored here
        if (!token) return;

        const fetchFilters = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/master/filters`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setMasterData(data);
                }
            } catch (error) {
                console.error("Error fetching master filters:", error);
            }
        };
        fetchFilters();
    }, []);

    const handleSelectChange = (e) => {
        const { name, value } = e.target;
        
        // Update local state
        const newFilters = { ...filters, [name]: value === "" ? "" : parseInt(value) };
        setFilters(newFilters);
        
        // Notify parent component (DashboardPage) of the change
        onFilterChange(newFilters);
    };

    return (
        <div className="bg-white shadow-md p-4 rounded-lg">
            <div className="flex justify-between items-center">
                
                {/* Logo */}
                <h1 className="text-3xl font-bold text-gray-800">LOGO</h1>
                
                {/* Filters */}
                <div className="flex space-x-4 items-center">
                    
                    {/* Zone Dropdown */}
                    <select
                        name="zone_id"
                        onChange={handleSelectChange}
                        className="p-2 border border-gray-300 rounded-md focus:ring-secondary-accent focus:border-secondary-accent"
                    >
                        <option value="">ZONE (All)</option>
                        {masterData.zones.map(z => (
                            <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                    </select>

                    {/* Street Dropdown */}
                    <select
                        name="street_id"
                        onChange={handleSelectChange}
                        className="p-2 border border-gray-300 rounded-md focus:ring-secondary-accent focus:border-secondary-accent"
                    >
                        <option value="">STREET (All)</option>
                        {masterData.streets.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    
                    {/* Unit Dropdown */}
                    <select
                        name="unit_id"
                        onChange={handleSelectChange}
                        className="p-2 border border-gray-300 rounded-md focus:ring-secondary-accent focus:border-secondary-accent"
                    >
                        <option value="">UNIT (All)</option>
                        {masterData.units.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                    
                    {/* Calendar (Date From) */}
                    <input
                        type="date"
                        name="date_from"
                        onChange={handleSelectChange}
                        className="p-2 border border-gray-300 rounded-md focus:ring-secondary-accent focus:border-secondary-accent"
                        title="Date From"
                    />

                    {/* Calendar (Date To) */}
                    <input
                        type="date"
                        name="date_to"
                        onChange={handleSelectChange}
                        className="p-2 border border-gray-300 rounded-md focus:ring-secondary-accent focus:border-secondary-accent"
                        title="Date To"
                    />

                </div>
            </div>
        </div>
    );
};

export default Navbar;