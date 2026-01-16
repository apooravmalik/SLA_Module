// src/components/LoginPage.jsx
import React, { useState } from "react";
import { FaSun, FaMoon } from "react-icons/fa";
import belLogo from "../assets/bel_logo.png";
import belLogoDark from "../assets/bel_logo_dark.png";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
const LOGIN_URL = `${API_BASE_URL}/auth/login`;

const LoginPage = ({ theme, toggleTheme }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const isDark = theme === 'dark';

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
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      {/* Theme Toggle Button - Top Right */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-full shadow-lg hover:opacity-80"
        style={{
          backgroundColor: "var(--bg-panel)",
          border: "1px solid var(--border-main)"
        }}
        aria-label="Toggle theme"
      >
        {isDark ? (
          <FaSun className="w-5 h-5 text-yellow-400" />
        ) : (
          <FaMoon className="w-5 h-5 text-gray-700" />
        )}
      </button>

      {/* Login Container */}
      <div 
        className="w-full max-w-4xl p-8 rounded-lg shadow-xl md:flex md:space-x-12"
        style={{
          backgroundColor: "var(--bg-panel)",
          border: "1px solid var(--border-main)"
        }}
      >
        {/* Left Side: Logo */}
        <div 
          className="flex-1 flex items-center justify-center p-8 border-b md:border-b-0 md:border-r"
          style={{ borderColor: "var(--border-main)" }}
        >
          <img 
            src={isDark ? belLogoDark : belLogo} 
            alt="BEL Logo" 
            className="h-28 w-auto object-contain"
          />
        </div>

        {/* Right Side: Login Form */}
        <div className="flex-1 pt-8 md:pt-0">
          <h2 
            className="text-2xl font-semibold mb-8"
            style={{ color: "var(--text-main)" }}
          >
            Login
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                style={{
                  backgroundColor: "var(--bg-app)",
                  border: "1px solid var(--border-main)",
                  color: "var(--text-main)"
                }}
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                style={{
                  backgroundColor: "var(--bg-app)",
                  border: "1px solid var(--border-main)",
                  color: "var(--text-main)"
                }}
              />
            </div>

            {/* Error Message */}
            {error && <p className="text-red-500 text-sm">{error}</p>}

            {/* Login Button */}
            <div>
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-lg shadow-md font-semibold hover:bg-sky-600 hover:text-white hover:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
                style={{
                  backgroundColor: "var(--bg-panel)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-main)"
                }}
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