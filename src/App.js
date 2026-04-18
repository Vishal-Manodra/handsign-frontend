import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      return alert("Please enter both a username and password.");
    }

    const endpoint = isRegistering ? 'register' : 'login';
    // This ensures no double slashes or missing slashes occur
    const baseUrl = "https://handsign-backend-tqvf.onrender.com/api/auth";
    const finalUrl = `${baseUrl}/${endpoint}`;

    console.log("Attempting Auth at:", finalUrl);

    try {
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          username: username.trim(), 
          password: password.trim() 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Authentication failed");
      }

      // Success!
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', username.toLowerCase());
      setIsLoggedIn(true);
      alert(isRegistering ? "Registration Successful! Please Login." : "Login Successful!");
      if (isRegistering) setIsRegistering(false);

    } catch (err) {
      console.error("Auth Error:", err);
      alert(err.message || "Something went wrong. Check console.");
    }
  };

  if (isLoggedIn) {
    return (
      <div className="app-container">
        <h1>Welcome, {username}!</h1>
        <p>Your Sign Language AI is ready.</p>
        <button onClick={() => setIsLoggedIn(false)}>Logout</button>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>SignAI</h1>
        <p>{isRegistering ? "Create your account." : "Sign in to continue."}</p>
        
        <form onSubmit={handleAuth}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
          />
          <button type="submit" className="auth-button">
            {isRegistering ? "Register" : "Sign In"}
          </button>
        </form>

        <p className="auth-toggle">
          {isRegistering ? "Already have an account? " : "Don't have an account? "}
          <span onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? "Sign In" : "Create one"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default App;