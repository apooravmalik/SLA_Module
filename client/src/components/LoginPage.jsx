// src/components/LoginPage.jsx
import React, { useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const LOGIN_URL = `${API_BASE_URL}/auth/login`;

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Construct form data as required by FastAPI's OAuth2PasswordRequestForm
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
      // Use the constructed URL with the environment variable
      const response = await fetch(LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Login Successful:", data);
        // SUCCESS: Store token (e.g., in localStorage) and redirect to dashboard
        localStorage.setItem('token', data.access_token);
        window.location.href = '/dashboard';
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Login failed. Check credentials.");
      }
    } catch (err) {
      setError("Network error. Could not connect to the API.");
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-primary-white flex items-center justify-center p-4">
      {/* Login Container */}
      <div className="w-full max-w-4xl p-8 bg-white border border-gray-200 rounded-lg shadow-xl md:flex md:space-x-12">
        {/* Left Side: Logo */}
        <div className="flex-1 flex items-center justify-center p-8 border-b md:border-b-0 md:border-r border-gray-100">
          <h1 className="text-8xl font-black text-gray-800 tracking-wider">
            LOGO
          </h1>
        </div>

        {/* Right Side: Login Form */}
        <div className="flex-1 pt-8 md:pt-0">
          <h2 className="text-2xl font-semibold mb-8 text-gray-700">Login</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-600"
              >
                username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-secondary-sky focus:border-secondary-sky"
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-600"
              >
                password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-secondary-sky focus:border-secondary-sky"
              />
            </div>

            {/* Error Message */}
            {error && <p className="text-red-500 text-sm">{error}</p>}

            {/* Login Button */}
            <div>
              <button
                type="submit"
                // Base State: White Background, Dark Text, Border to be visible
                className="w-full py-2 px-4 border border-gray-300 rounded-lg shadow-md font-semibold transition duration-150
                   bg-white text-gray-700 
                   
                   /* Hover State: Sky Blue Background, White Text */
                   hover:bg-sky-600 hover:text-white hover:border-transparent 

                   /* Focus State (remains Sky Blue) */
                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
              >
                Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
