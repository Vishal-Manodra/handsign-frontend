import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";

// 1. FULL LIST OF SIGNS
const KNOWN_SIGNS = [
  "Peace", "Hello", "Pointing Up", "Fist", 
  "A", "L", "W", "Thank You", 
  "I Love You", "OK", "Call Me"
];

function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  
  // --- SECURITY STATE VARIABLES ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState(""); 
  const [password, setPassword] = useState(""); 
  const [isRegistering, setIsRegistering] = useState(false);
  
  // --- GAME STATE VARIABLES ---
  const [gesture, setGesture] = useState("Waiting...");
  const [mode, setMode] = useState("Translate");
  const [targetSign, setTargetSign] = useState("Peace");
  const [score, setScore] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false); 

  const lastSpokenRef = useRef("");
  const modeRef = useRef("Translate");
  const targetSignRef = useRef("Peace");
  const scoreRef = useRef(0);
  const cooldownRef = useRef(false);
  
  const gestureHistoryRef = useRef([]); 
  const consecutiveSignRef = useRef({ sign: "", count: 0 }); 
  const lockedGestureRef = useRef("Waiting..."); 

  // --- THE AUTHENTICATION LOGIC ---
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      return alert("Please enter both a username and password.");
    }

    const endpoint = isRegistering ? 'register' : 'login';

    try {
      const response = await fetch(`https://handsign-backend-tqvf.onrender.com/api/auth/${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Authentication failed");
      }

      localStorage.setItem('signai_token', data.token);
      setScore(data.user.xp || 0);
      scoreRef.current = data.user.xp || 0;
      setIsLoggedIn(true);

    } catch (err) {
      console.error("Auth error:", err);
      alert(err.message);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    modeRef.current = newMode;
    if (newMode === "Learn") pickNewSign();
  };

  const pickNewSign = () => {
    let nextSign;
    do {
      nextSign = KNOWN_SIGNS[Math.floor(Math.random() * KNOWN_SIGNS.length)];
    } while (nextSign === targetSignRef.current);
    setTargetSign(nextSign);
    targetSignRef.current = nextSign;
  };

  const isFingerUp = (landmarks, tipIdx, knuckleIdx) => landmarks[tipIdx].y < landmarks[knuckleIdx].y;
  const isThumbOut = (landmarks) => Math.abs(landmarks[4].x - landmarks[17].x) > Math.abs(landmarks[2].x - landmarks[17].x);
  const getDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  const labelGesture = (landmarks) => {
    const indexUp = isFingerUp(landmarks, 8, 6);
    const middleUp = isFingerUp(landmarks, 12, 10);
    const ringUp = isFingerUp(landmarks, 16, 14);
    const pinkyUp = isFingerUp(landmarks, 20, 18);
    const thumbOut = isThumbOut(landmarks);
    const distThumbIndex = getDistance(landmarks[4], landmarks[8]);

    gestureHistoryRef.current.push(landmarks[0]);
    if (gestureHistoryRef.current.length > 15) gestureHistoryRef.current.shift();

    if (indexUp && middleUp && ringUp && pinkyUp && gestureHistoryRef.current.length === 15) {
      const move = gestureHistoryRef.current[14].y - gestureHistoryRef.current[0].y;
      if (move > 0.08) { gestureHistoryRef.current = []; return "Thank You"; }
    }

    if (distThumbIndex < 0.10 && middleUp && ringUp && pinkyUp) return "OK";
    if (indexUp && !middleUp && !ringUp && pinkyUp && thumbOut) return "I Love You";
    if (!indexUp && !middleUp && !ringUp && pinkyUp && thumbOut) return "Call Me";
    if (indexUp && middleUp && !ringUp && !pinkyUp && !thumbOut) return "Peace";
    if (indexUp && middleUp && ringUp && pinkyUp && thumbOut) return "Hello";
    if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "Pointing Up";
    if (!indexUp && !middleUp && !ringUp && !pinkyUp && thumbOut) return "A";
    if (indexUp && !middleUp && !ringUp && !pinkyUp && thumbOut) return "L";
    if (indexUp && middleUp && ringUp && !pinkyUp) return "W";
    if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut) return "Fist";
    return "Scanning...";
  };

  const speak = (text) => {
    if (text !== "Scanning..." && text !== "Waiting..." && text !== lastSpokenRef.current) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      lastSpokenRef.current = text;
    }
  };

  function onResults(results) {
    if (!webcamRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.save();
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: "#FFF", lineWidth: 3 });
        window.drawLandmarks(ctx, landmarks, { color: "#007AFF", lineWidth: 2, radius: 4 });

        const raw = labelGesture(landmarks);
        if (raw === "Thank You") {
          lockedGestureRef.current = "Thank You";
        } else if (raw !== "Scanning...") {
          if (raw === consecutiveSignRef.current.sign) {
            consecutiveSignRef.current.count++;
          } else {
            consecutiveSignRef.current = { sign: raw, count: 1 };
          }
          if (consecutiveSignRef.current.count >= 15) lockedGestureRef.current = raw;
        }
        setGesture(lockedGestureRef.current);

        if (modeRef.current === "Translate") speak(lockedGestureRef.current);
        else if (modeRef.current === "Learn" && !cooldownRef.current && lockedGestureRef.current === targetSignRef.current) {
          cooldownRef.current = true;
          scoreRef.current += 10;
          setScore(scoreRef.current);
          setShowSuccess(true);
          speak("Correct!");
          
          fetch("https://handsign-backend-tqvf.onrender.com/api/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, score: scoreRef.current })
          }).catch(console.error);

          setTimeout(() => {
            setShowSuccess(false);
            pickNewSign();
            lockedGestureRef.current = "Waiting...";
            cooldownRef.current = false;
          }, 2000);
        }
      }
    } else {
      setGesture("No hand detected");
      lockedGestureRef.current = "Waiting...";
      consecutiveSignRef.current.count = 0;
    }
    ctx.restore();
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isLoggedIn || !window.Hands) return;
    const hands = new window.Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(onResults);
    let camera = null;
    const startCamera = () => {
      if (webcamRef.current?.video?.readyState >= 2) {
        camera = new window.Camera(webcamRef.current.video, {
          onFrame: async () => { if (webcamRef.current?.video) await hands.send({ image: webcamRef.current.video }); },
          width: 640, height: 480,
        });
        camera.start();
      } else { setTimeout(startCamera, 250); }
    };
    startCamera();
    return () => { if (camera) camera.stop(); };
  }, [isLoggedIn]);

  // --- APPLE UI STYLES ---
  const colors = { 
    bg: "#F5F5F7", card: "#FFFFFF", primary: "#007AFF", 
    text: "#1D1D1F", secondary: "#34C759", border: "#E5E5EA" 
  };
  const appleFont = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  // --- LOGIN SCREEN ---
  if (!isLoggedIn) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: colors.bg, color: colors.text, fontFamily: appleFont }}>
        <div style={{ backgroundColor: colors.card, padding: "50px", borderRadius: "20px", textAlign: "center", width: "380px", boxShadow: "0 10px 40px rgba(0,0,0,0.08)" }}>
          <h1 style={{ color: colors.text, fontSize: "2.5rem", margin: "0", fontWeight: "700", letterSpacing: "-0.5px" }}>SignAI</h1>
          <p style={{ color: "#86868B", marginBottom: "35px", fontSize: "1.1rem" }}>
            {isRegistering ? "Create your account." : "Sign in to continue."}
          </p>
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: "16px", borderRadius: "12px", border: `1px solid ${colors.border}`, backgroundColor: "#FAFAFA", color: colors.text, fontSize: "16px", outline: "none" }} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: "16px", borderRadius: "12px", border: `1px solid ${colors.border}`, backgroundColor: "#FAFAFA", color: colors.text, fontSize: "16px", outline: "none" }} />
            <button type="submit" style={{ padding: "16px", backgroundColor: colors.primary, color: "white", border: "none", borderRadius: "12px", fontWeight: "600", fontSize: "16px", cursor: "pointer", marginTop: "15px", transition: "all 0.2s ease" }}>
              {isRegistering ? "Continue" : "Sign In"}
            </button>
          </form>
          <p onClick={() => setIsRegistering(!isRegistering)} style={{ color: colors.primary, marginTop: "25px", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}>
            {isRegistering ? "Already have an account? Sign In" : "Don't have an account? Create one"}
          </p>
        </div>
      </div>
    );
  }

  // --- MAIN APP SCREEN ---
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", backgroundColor: colors.bg, color: colors.text, fontFamily: appleFont, padding: "40px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: "800px", marginBottom: "30px", backgroundColor: "transparent" }}>
        <h2 style={{ margin: 0, color: colors.text, fontSize: "2rem", letterSpacing: "-0.5px" }}>SignAI</h2>
        <div style={{ backgroundColor: colors.card, padding: "8px 16px", borderRadius: "20px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", fontWeight: "600", color: colors.primary }}>
          {score} XP
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", marginBottom: "40px", backgroundColor: "#E3E3E8", padding: "4px", borderRadius: "14px" }}>
        <button onClick={() => switchMode("Translate")} style={{ padding: "10px 30px", backgroundColor: mode === "Translate" ? colors.card : "transparent", color: mode === "Translate" ? colors.text : "#86868B", border: "none", borderRadius: "10px", fontWeight: "600", boxShadow: mode === "Translate" ? "0 2px 8px rgba(0,0,0,0.1)" : "none", cursor: "pointer", transition: "all 0.2s ease" }}>Translate</button>
        <button onClick={() => switchMode("Learn")} style={{ padding: "10px 30px", backgroundColor: mode === "Learn" ? colors.card : "transparent", color: mode === "Learn" ? colors.text : "#86868B", border: "none", borderRadius: "10px", fontWeight: "600", boxShadow: mode === "Learn" ? "0 2px 8px rgba(0,0,0,0.1)" : "none", cursor: "pointer", transition: "all 0.2s ease" }}>Learn</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "30px", width: "100%", maxWidth: "1000px" }}>
        <div style={{ position: "relative", borderRadius: "24px", overflow: "hidden", border: `4px solid ${showSuccess ? colors.secondary : "transparent"}`, backgroundColor: "black", width: "640px", height: "480px", boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}>
          <Webcam ref={webcamRef} style={{ width: 640, height: 480, transform: "scaleX(-1)" }} mirrored={true} />
          <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: 640, height: 480, transform: "scaleX(-1)" }} />
          {showSuccess && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(52, 199, 89, 0.2)", display: "flex", justifyContent: "center", alignItems: "center", backdropFilter: "blur(4px)" }}>
              <div style={{ backgroundColor: colors.card, padding: "15px 40px", borderRadius: "30px", boxShadow: "0 10px 20px rgba(0,0,0,0.1)" }}>
                <h1 style={{ color: colors.secondary, fontSize: "2rem", margin: 0, fontWeight: "700" }}>Correct</h1>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", backgroundColor: colors.card, padding: "40px", borderRadius: "24px", minWidth: "300px", boxShadow: "0 20px 40px rgba(0,0,0,0.06)", flex: 1 }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#86868B", fontWeight: "500", fontSize: "1.1rem" }}>{mode === "Translate" ? "Detected Sign" : "Show the sign for"}</h3>
          <p style={{ fontSize: "3rem", fontWeight: "700", margin: 0, color: mode === "Translate" ? colors.primary : colors.text, textAlign: "center", letterSpacing: "-1px" }}>{mode === "Translate" ? gesture : targetSign}</p>
        </div>
      </div>
    </div>
  );
}

export default App; 